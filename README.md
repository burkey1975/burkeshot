# Burkeshot V12

Burkeshot is a local Windows golf-video analyser, practice-session tracker and
interactive 4K Three.js range. V12 prioritises traceable measurements over
manufactured launch-monitor figures.

## Quick start

1. Install Python 3.11 or newer.
2. Double-click `INSTALL_CAMERA_ENGINE.bat` once.
3. Double-click `START_BURKESHOT_V12.bat`.
4. Leave the console open while using Burkeshot.

The browser normally opens `http://127.0.0.1:8811/?v=12`. If that port is busy,
the launcher selects the next available local port.

## Recommended shot workflow

1. Record fixed, genuinely side-on video with bright light and a fast shutter.
2. Put a measured 0.1–3 metre reference at ball depth along the target line.
3. Choose the actual capture mode before analysing.
4. Load the original video, select **Select ball**, and click the stationary ball.
5. Wait for timestamp-aware tracking to complete.
6. Mark reference A → B towards the target and confirm the camera plane.
7. Correct four ball or clubhead frames if automatic tracking is uncertain.
8. Save only after reviewing the trace and measurement explanations.

The selected point anchors detection even when colour thresholding is unreliable.
Original real-time files use decoded container presentation timestamps. Confirmed
slow-motion files use the selected source capture rate.

## Measurement boundaries

A single side-on camera can estimate image-plane ball speed, launch angle,
clubhead speed and attack angle after calibration. It cannot directly measure
launch direction, backspin, sidespin, wind, drag or lift.

Carry remains explicitly labelled **MODELLED CARRY**. It is not equivalent to a
radar or stereoscopic launch monitor. The ball profile factor is now applied once
and recorded with the saved calibration.

Rear/down-the-line footage supports impact replay and swing review, not calibrated
ball speed or carry. A second synchronized camera or external launch-monitor feed
is required for dependable 3D direction and curvature.

## V12 architecture

- FastAPI local service with validated streaming uploads.
- Queued analysis with real stages and cancellation.
- PyAV frame timestamps with OpenCV detection and tracking.
- One calibrated browser measurement path; raw tracker estimates are diagnostics.
- SQLite shot persistence with local-storage fallback and CSV export.
- Three.js textured 4K range with a software fallback.
- Separate face-on and down-the-line coaching checkpoint sets.

## Development

```text
npm ci
python -m pip install -r requirements.txt
npm test
python server.py --open
```

GitHub Actions runs JavaScript, graphics, calibration and Python backend tests on
every push and pull request.

## Graphics

The course is an original Magnolia-inspired practice landscape. Native 4K refers
to the 3840 × 2160 render/export buffer. It is not an Augusta National, Masters or
GSPro product and does not use their code, course files or artwork.

Further photorealism requires authored PBR terrain layers, true 3D vegetation,
LOD assets and a larger course-content pipeline. Those are separate from the
measurement fixes delivered in V12.
