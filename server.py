from __future__ import annotations

import asyncio
import json
import os
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse


ROOT = Path(__file__).resolve().parent
WORK = ROOT / "_work"
DATABASE = ROOT / "burkeshot.db"
PREFERRED_PORT = int(os.environ.get("BURKESHOT_PORT", "8811"))
MAX_UPLOAD_BYTES = 700 * 1024 * 1024
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".webm"}

@asynccontextmanager
async def lifespan(_app: FastAPI):
    WORK.mkdir(exist_ok=True)
    initialise_database()
    yield


app = FastAPI(title="Burkeshot API", version="12.0.0", docs_url="/api/docs", lifespan=lifespan)
jobs: dict[str, dict[str, Any]] = {}
job_cancels: dict[str, threading.Event] = {}
jobs_lock = threading.Lock()
analysis_gate = threading.Semaphore(1)


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialise_database() -> None:
    with _db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS shots (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key not in {"path", "cancel_event"}}


def _update_job(job_id: str, **values: Any) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(values)


def _prune_jobs() -> None:
    cutoff = time.time() - 60 * 60
    with jobs_lock:
        stale = [job_id for job_id, job in jobs.items() if job.get("updated_at", 0) < cutoff]
        for job_id in stale:
            jobs.pop(job_id, None)
            job_cancels.pop(job_id, None)


async def _save_upload(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "shot.mp4").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(400, f"Unsupported video type: {suffix or 'unknown'}")
    WORK.mkdir(exist_ok=True)
    fd, path = tempfile.mkstemp(prefix="shot_", suffix=suffix, dir=str(WORK))
    os.close(fd)
    total = 0
    try:
        with open(path, "wb") as target:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Video exceeds the 700 MB local-analysis limit")
                target.write(chunk)
        if total == 0:
            raise HTTPException(400, "The uploaded video is empty")
        return path
    except Exception:
        Path(path).unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def _run_analysis(
    job_id: str,
    path: str,
    capture_fps: float,
    capture_mode: str,
    ball_hint: tuple[float, float] | None,
) -> None:
    cancel = job_cancels[job_id]

    def progress(stage: str, percent: int) -> None:
        if cancel.is_set():
            raise InterruptedError("Analysis cancelled")
        _update_job(
            job_id,
            status="running",
            stage=stage,
            progress=max(1, min(99, int(percent))),
            updated_at=time.time(),
        )

    try:
        progress("Waiting for the analysis engine", 2)
        with analysis_gate:
            if cancel.is_set():
                raise InterruptedError("Analysis cancelled")
            from analyzer import analyze_video

            result = analyze_video(
                path,
                capture_fps,
                capture_mode,
                ball_hint=ball_hint,
                progress=progress,
            )
        _update_job(
            job_id,
            status="complete",
            stage="Analysis complete",
            progress=100,
            result=result,
            updated_at=time.time(),
        )
    except InterruptedError:
        _update_job(job_id, status="cancelled", stage="Analysis cancelled", progress=0, updated_at=time.time())
    except Exception as exc:
        import traceback

        traceback.print_exc()
        _update_job(job_id, status="failed", error=str(exc), stage="Analysis failed", updated_at=time.time())
    finally:
        Path(path).unlink(missing_ok=True)


@app.get("/api/health")
def health() -> dict[str, Any]:
    try:
        import av  # noqa: F401
        import cv2  # noqa: F401
        import numpy  # noqa: F401

        return {"status": "ready", "version": 12, "camera_engine": True, "timestamp_engine": "pyav"}
    except Exception as exc:
        return {"status": "missing_engine", "version": 12, "camera_engine": False, "error": str(exc)}


@app.post("/api/jobs/analyze", status_code=202)
async def create_analysis_job(
    video: UploadFile = File(...),
    capture_fps: float = Query(240, ge=1, le=1000),
    capture_mode: str = Query("240_slo", pattern="^(240_slo|120_slo|original|real_auto)$"),
    ball_hint_x: float | None = Query(None, ge=0, le=1),
    ball_hint_y: float | None = Query(None, ge=0, le=1),
) -> dict[str, Any]:
    _prune_jobs()
    path = await _save_upload(video)
    job_id = uuid.uuid4().hex
    hint = (ball_hint_x, ball_hint_y) if ball_hint_x is not None and ball_hint_y is not None else None
    cancel = threading.Event()
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "stage": "Video uploaded",
            "progress": 1,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        job_cancels[job_id] = cancel
    threading.Thread(
        target=_run_analysis,
        args=(job_id, path, capture_fps, capture_mode, hint),
        daemon=True,
        name=f"burkeshot-{job_id[:8]}",
    ).start()
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_analysis_job(job_id: str) -> dict[str, Any]:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Analysis job not found")
        return _public_job(dict(job))


@app.delete("/api/jobs/{job_id}")
def cancel_analysis_job(job_id: str) -> dict[str, str]:
    with jobs_lock:
        job = jobs.get(job_id)
        cancel = job_cancels.get(job_id)
        if not job or not cancel:
            raise HTTPException(404, "Analysis job not found")
        if job["status"] in {"complete", "failed", "cancelled"}:
            return {"status": job["status"]}
        cancel.set()
        job.update(status="cancelling", stage="Stopping analysis", updated_at=time.time())
    return {"status": "cancelling"}


@app.post("/api/coach")
async def coach(
    video: UploadFile = File(...),
    handedness: str = Query("right", pattern="^(right|left)$"),
    view: str = Query("dtl", pattern="^(dtl|face_on)$"),
) -> JSONResponse:
    path = await _save_upload(video)
    try:
        from coach_analyzer import analyze_swing

        result = await asyncio.to_thread(analyze_swing, path, handedness, view)
        return JSONResponse(result)
    finally:
        Path(path).unlink(missing_ok=True)


@app.get("/api/shots")
def list_shots() -> list[dict[str, Any]]:
    with _db() as connection:
        rows = connection.execute("SELECT payload FROM shots ORDER BY created_at DESC LIMIT 500").fetchall()
    return [json.loads(row["payload"]) for row in rows]


@app.post("/api/shots", status_code=201)
def save_shot(payload: dict[str, Any]) -> dict[str, Any]:
    shot_id = str(payload.get("id") or uuid.uuid4().hex)
    created_at = str(payload.get("date") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    stored = {**payload, "id": shot_id, "date": created_at, "version": 12}
    with _db() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO shots(id, created_at, payload) VALUES(?, ?, ?)",
            (shot_id, created_at, json.dumps(stored, separators=(",", ":"))),
        )
    return stored


@app.delete("/api/shots/{shot_id}", status_code=204)
def delete_shot(shot_id: str) -> None:
    with _db() as connection:
        connection.execute("DELETE FROM shots WHERE id = ?", (shot_id,))


@app.delete("/api/shots", status_code=204)
def clear_shots() -> None:
    with _db() as connection:
        connection.execute("DELETE FROM shots")


PUBLIC_FILES = {
    "index.html", "style.css", "v10.css", "calibration.css", "range-hd.bundle.js",
    "range-hd.bundle.js.LEGAL.txt", "range-software.js", "measurement.js", "app.js",
    "simulator.js", "video-replay.js", "v12-status.js",
    "calibration-ui.js",
}


@app.get("/{resource_path:path}", include_in_schema=False)
def static_ui(resource_path: str):
    resource_path = resource_path or "index.html"
    if resource_path in PUBLIC_FILES:
        return FileResponse(ROOT / resource_path)
    if resource_path.startswith("assets/"):
        candidate = (ROOT / resource_path).resolve()
        assets = (ROOT / "assets").resolve()
        if candidate.is_file() and candidate.parent == assets:
            return FileResponse(candidate)
    raise HTTPException(404, "Not found")


def available_port(start_port: int) -> int:
    for port in range(start_port, start_port + 50):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError("No local port available")


if __name__ == "__main__":
    import uvicorn

    port = available_port(PREFERRED_PORT)
    url = f"http://127.0.0.1:{port}/?v=12"
    print("\nBURKESHOT v12 — CALIBRATED VIDEO + MAGNOLIA PRACTICE")
    print("Open:", url)
    print("Keep this window open while using camera or coach analysis.\n", flush=True)
    if "--open" in sys.argv and os.environ.get("BURKESHOT_NO_BROWSER") != "1":
        threading.Timer(0.8, lambda: webbrowser.open(url, new=2)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
