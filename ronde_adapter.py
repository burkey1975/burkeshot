from __future__ import annotations

"""Ronde-inspired evidence-gated golf-ball tracking for BurkeShot.

This adapter keeps BurkeShot's OpenCV candidate generation, timestamp handling,
and output contract, but replaces the fragile single-path selection step with a
small beam search. Tracks are accepted only when they are source-time ordered,
motion-consistent, move away from the strike point, and contain enough observed
evidence. If no improved track is found, BurkeShot's original tracker is used.
"""

import math
from dataclasses import dataclass
from typing import Any, Iterable

import cv2
import numpy as np

BALL_DIAMETER_M = 0.04267
MPS_TO_MPH = 2.2369362921


@dataclass(frozen=True)
class Observation:
    frame: int
    time_s: float
    x: float
    y: float
    quality: float
    blob_w: int = 0
    blob_h: int = 0
    blob_area: float = 0.0
    blob_aspect: float = 1.0


@dataclass
class Beam:
    observations: list[Observation]
    score: float
    misses: int = 0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _distance(a: Observation, b: Observation) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


def _velocity(a: Observation, b: Observation) -> tuple[float, float] | None:
    dt = b.time_s - a.time_s
    if dt <= 0:
        return None
    return ((b.x - a.x) / dt, (b.y - a.y) / dt)


def _link_penalty(history: list[Observation], candidate: Observation, diag: float) -> float | None:
    """Return a small penalty for a plausible continuation, else reject it."""
    if not history:
        return 0.0
    last = history[-1]
    elapsed = candidate.time_s - last.time_s
    if elapsed <= 0 or elapsed > 0.115:
        return None

    step_px = _distance(last, candidate)
    step_norm = step_px / max(1.0, diag)
    speed_norm = step_norm / elapsed
    if speed_norm > 2.6:
        return None

    if len(history) == 1:
        if step_norm < 0.0015:
            return None
        return max(0.0, elapsed - 0.05) * 4.0

    old = history[-2]
    old_v = _velocity(old, last)
    new_v = _velocity(last, candidate)
    if old_v is None or new_v is None:
        return None
    old_speed = math.hypot(*old_v)
    new_speed = math.hypot(*new_v)
    if old_speed <= 1e-9 or new_speed <= 1e-9:
        return None

    cosine = (old_v[0] * new_v[0] + old_v[1] * new_v[1]) / (old_speed * new_speed)
    predicted_x = last.x + old_v[0] * elapsed
    predicted_y = last.y + old_v[1] * elapsed
    prediction_error = math.hypot(candidate.x - predicted_x, candidate.y - predicted_y) / max(1.0, diag)

    rising_before = last.y < old.y
    descending_now = candidate.y > last.y
    apex_turn = rising_before and descending_now and abs(candidate.x - last.x) / max(1.0, diag) < 0.08
    if cosine < 0.30 and not apex_turn:
        return None

    tolerance = max(0.010, old_speed * elapsed * 1.9 + 0.010)
    if prediction_error > tolerance and not apex_turn:
        return None

    speed_ratio = new_speed / old_speed
    if not 0.10 <= speed_ratio <= 4.0:
        return None

    return (
        max(0.0, elapsed - 0.05) * 5.0
        + prediction_error / 0.008
        + max(0.0, 0.65 - cosine) * 1.2
        + abs(math.log(max(0.05, speed_ratio))) * 0.10
    )


def _coverage(observations: list[Observation]) -> float:
    if len(observations) < 2:
        return 0.0
    duration = observations[-1].time_s - observations[0].time_s
    if duration <= 0:
        return 0.0
    occupied = 0.0
    for a, b in zip(observations, observations[1:]):
        occupied += min(max(0.0, b.time_s - a.time_s), 0.05)
    return min(1.0, occupied / duration)


def _validate_track(
    observations: list[Observation],
    anchor: Observation,
    diag: float,
    capture_fps: float,
) -> tuple[bool, dict[str, float]]:
    measured = [o for o in observations if o.frame > anchor.frame]
    if len(measured) < 4:
        return False, {"reason": 1.0}

    duration = measured[-1].time_s - measured[0].time_s
    displacement = max(math.hypot(o.x - anchor.x, o.y - anchor.y) for o in measured) / max(1.0, diag)
    upward = max(0.0, (anchor.y - min(o.y for o in measured)) / max(1.0, diag))
    coverage = _coverage(measured)
    mean_quality = float(np.mean([o.quality for o in measured])) if measured else 0.0

    min_duration = max(0.018, min(0.095, 3.0 / max(30.0, capture_fps)))
    enough_motion = displacement >= 0.008
    enough_time = duration >= min_duration
    enough_coverage = coverage >= 0.48
    enough_quality = mean_quality >= 0.24

    return (
        enough_motion and enough_time and enough_coverage and enough_quality,
        {
            "duration_s": duration,
            "displacement_norm": displacement,
            "upward_norm": upward,
            "coverage": coverage,
            "mean_quality": mean_quality,
        },
    )


def _recompute_metrics(
    analyzer: Any,
    points: list[dict[str, Any]],
    ball: dict[str, Any],
    capture_fps: float,
    frame_times: list[float] | None,
    confidence: float,
) -> dict[str, Any]:
    diameter = max(8.0, float(ball["diameter_px"]))
    pixels_per_meter = diameter / BALL_DIAMETER_M

    launch = None
    sideon_ratio = None
    if len(points) >= 3:
        fit = points[: min(9, len(points))]
        dx = float(fit[-1]["x"] - fit[0]["x"])
        dy = float(fit[-1]["y"] - fit[0]["y"])
        if abs(dx) > diameter * 0.8:
            raw = math.degrees(math.atan2(-dy, abs(dx)))
            if -5 <= raw <= 55:
                launch = float(raw)
        sideon_ratio = abs(dx) / (abs(dy) + 1e-6)

    speeds: list[float] = []
    for a, b in zip(points, points[1:]):
        at = float(a.get("time_s", analyzer._point_time(a["frame"], frame_times, capture_fps)))
        bt = float(b.get("time_s", analyzer._point_time(b["frame"], frame_times, capture_fps)))
        dt = bt - at
        if dt <= 0:
            continue
        metres = math.hypot(b["x"] - a["x"], b["y"] - a["y"]) / pixels_per_meter
        mps = metres / dt
        if 8 <= mps <= 100:
            speeds.append(float(mps))

    speed_mph = None
    if len(speeds) >= 3:
        arr = np.asarray(speeds[:8], dtype=float)
        median = float(np.median(arr))
        keep = arr[np.abs(arr - median) <= max(8.0, median * 0.36)]
        if len(keep) >= 3:
            speed_mph = float(np.median(keep) * MPS_TO_MPH)

    return {
        "points": points,
        "confidence": _clamp(confidence, 0.0, 0.96),
        "ball_speed_mph": speed_mph,
        "launch_angle_deg": launch,
        "pixels_per_meter": pixels_per_meter,
        "sideon_ratio": sideon_ratio,
        "step_speeds_mps": speeds[:8],
        "recovery_used": True,
        "selector": "ronde_evidence_gate_v1",
    }


def _candidate_groups(
    analyzer: Any,
    path: str,
    ball: dict[str, Any],
    impact: dict[str, Any],
    capture_fps: float,
    frame_count: int,
    frame_times: list[float] | None,
) -> tuple[Observation, list[list[Observation]], float]:
    cap = cv2.VideoCapture(path)
    contact = int(impact["contact_frame"])
    base = analyzer._frame_at(cap, max(0, contact - 2))
    if base is None:
        cap.release()
        raise RuntimeError("Unable to read pre-impact frame")

    height, width = base.shape[:2]
    diag = math.hypot(width, height)
    x0 = float(ball["x"])
    y0 = float(ball["y"])
    diameter = max(8.0, float(ball["diameter_px"]))
    anchor = Observation(
        frame=contact,
        time_s=analyzer._point_time(contact, frame_times, capture_fps),
        x=x0,
        y=y0,
        quality=1.0,
    )

    max_frames = max(16, min(72, int(round(capture_fps * 0.24))))
    end = min(frame_count, contact + max_frames + 1)
    groups: list[list[Observation]] = []
    for frame_index in range(contact + 1, end):
        frame = analyzer._frame_at(cap, frame_index)
        if frame is None:
            break

        elapsed_frames = frame_index - contact
        radius = min(
            max(width, height) * 1.08,
            max(120.0, diameter * 14.0) + elapsed_frames * max(34.0, diameter * 4.2),
        )
        roi = [x0 - radius, y0 - radius, x0 + radius, y0 + radius]
        raw = analyzer._bg_streak_candidates(base, frame, roi, diameter)
        raw = sorted(raw, key=lambda c: float(c.get("quality", 0.0)), reverse=True)[:22]
        time_s = analyzer._point_time(frame_index, frame_times, capture_fps)
        group = [
            Observation(
                frame=frame_index,
                time_s=time_s,
                x=float(c["x"]),
                y=float(c["y"]),
                quality=_clamp(float(c.get("quality", 0.0)), 0.0, 1.0),
                blob_w=int(c.get("w", 0)),
                blob_h=int(c.get("h", 0)),
                blob_area=float(c.get("area", 0.0)),
                blob_aspect=float(c.get("aspect", 1.0)),
            )
            for c in raw
        ]
        groups.append(group)

    cap.release()
    return anchor, groups, diag


def _select_track(
    anchor: Observation,
    groups: Iterable[list[Observation]],
    diag: float,
    capture_fps: float,
) -> tuple[list[Observation], float, dict[str, float]] | None:
    beams: list[Beam] = [Beam([anchor], 0.0, 0)]
    completed: list[Beam] = []

    for group in groups:
        if not group:
            next_beams: list[Beam] = []
            for beam in beams:
                if beam.misses < 2:
                    next_beams.append(Beam(beam.observations, beam.score - 0.18, beam.misses + 1))
                else:
                    completed.append(beam)
            beams = next_beams or beams
            continue

        next_beams: list[Beam] = []
        for beam in beams:
            extended = False
            for candidate in group:
                if len(beam.observations) == 1:
                    launch_move = math.hypot(candidate.x - anchor.x, candidate.y - anchor.y)
                    if launch_move < max(4.0, diag * 0.0025):
                        continue
                penalty = _link_penalty(beam.observations, candidate, diag)
                if penalty is None:
                    continue
                extended = True
                reward = 1.25 + candidate.quality * 1.15 - penalty
                next_beams.append(Beam(beam.observations + [candidate], beam.score + reward, 0))

            if not extended:
                last = beam.observations[-1]
                current_time = min((c.time_s for c in group), default=last.time_s)
                if beam.misses < 2 and current_time - last.time_s <= 0.115:
                    next_beams.append(Beam(beam.observations, beam.score - 0.18, beam.misses + 1))
                else:
                    completed.append(beam)

        next_beams.sort(key=lambda b: (len(b.observations), b.score), reverse=True)
        beams = next_beams[:160]
        if not beams:
            break

    completed.extend(beams)
    ranked: list[tuple[float, Beam, dict[str, float]]] = []
    for beam in completed:
        valid, diagnostics = _validate_track(beam.observations, anchor, diag, capture_fps)
        if not valid:
            continue
        measured_count = max(0, len(beam.observations) - 1)
        rank = (
            beam.score
            + measured_count * 2.2
            + diagnostics["coverage"] * 3.5
            + diagnostics["displacement_norm"] * 20.0
            + diagnostics["upward_norm"] * 8.0
        )
        ranked.append((rank, beam, diagnostics))

    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    _, winner, diagnostics = ranked[0]
    quality = float(np.mean([o.quality for o in winner.observations[1:]]))
    confidence = _clamp(
        0.24
        + 0.055 * max(0, len(winner.observations) - 1)
        + 0.24 * diagnostics["coverage"]
        + 0.20 * quality,
        0.0,
        0.94,
    )
    return winner.observations, confidence, diagnostics


def ronde_track_ball(
    analyzer: Any,
    path: str,
    ball: dict[str, Any],
    impact: dict[str, Any],
    capture_fps: float,
    frame_count: int,
    frame_times: list[float] | None = None,
) -> dict[str, Any] | None:
    anchor, groups, diag = _candidate_groups(
        analyzer, path, ball, impact, capture_fps, frame_count, frame_times
    )
    selected = _select_track(anchor, groups, diag, capture_fps)
    if selected is None:
        return None
    observations, confidence, diagnostics = selected

    points: list[dict[str, Any]] = []
    for index, observation in enumerate(observations):
        point = {
            "frame": observation.frame,
            "time_s": observation.time_s,
            "x": observation.x,
            "y": observation.y,
            "kind": "address" if index == 0 else "ronde_observed",
        }
        if index > 0:
            point.update(
                blob_w=observation.blob_w,
                blob_h=observation.blob_h,
                blob_area=observation.blob_area,
                blob_aspect=observation.blob_aspect,
                detector_quality=observation.quality,
            )
        points.append(point)

    result = _recompute_metrics(
        analyzer, points, ball, capture_fps, frame_times, confidence
    )
    result["track_validation"] = diagnostics
    return result


def install(analyzer: Any) -> None:
    """Install the evidence-gated tracker into the already imported analyzer module."""
    if getattr(analyzer, "_ronde_adapter_installed", False):
        return

    original = analyzer.track_ball

    def patched_track_ball(
        path: str,
        ball: dict[str, Any],
        impact: dict[str, Any],
        capture_fps: float,
        frame_count: int,
        frame_times=None,
    ):
        baseline = original(path, ball, impact, capture_fps, frame_count, frame_times)
        try:
            candidate = ronde_track_ball(
                analyzer, path, ball, impact, capture_fps, frame_count, frame_times
            )
        except Exception as exc:
            baseline["ronde_selector_error"] = str(exc)
            baseline["selector"] = baseline.get("selector", "burkeshot_original")
            return baseline

        if not candidate:
            baseline["selector"] = baseline.get("selector", "burkeshot_original")
            baseline["ronde_selector_status"] = "no_valid_evidence_track"
            return baseline

        baseline_count = len(baseline.get("points", []))
        candidate_count = len(candidate.get("points", []))
        baseline_conf = float(baseline.get("confidence", 0.0) or 0.0)
        candidate_conf = float(candidate.get("confidence", 0.0) or 0.0)

        if candidate_count >= max(5, baseline_count + 1) or candidate_conf >= baseline_conf + 0.08:
            candidate["baseline_points"] = baseline_count
            candidate["baseline_confidence"] = baseline_conf
            return candidate

        baseline["selector"] = baseline.get("selector", "burkeshot_original")
        baseline["ronde_candidate_points"] = candidate_count
        baseline["ronde_candidate_confidence"] = candidate_conf
        return baseline

    analyzer.track_ball = patched_track_ball
    analyzer._ronde_adapter_installed = True
