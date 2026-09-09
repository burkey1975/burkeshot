from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi import HTTPException

import server
from analyzer import _ball_from_hint, _point_time


def test_point_time_prefers_decoded_timestamp():
    assert _point_time(2, [0.0, 0.004, 0.009], 240) == 0.009
    assert abs(_point_time(2, [], 240) - 2 / 240) < 1e-12


def test_selected_ball_anchor_survives_non_white_ball(tmp_path: Path):
    path = tmp_path / "hint.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    for _ in range(20):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.circle(frame, (96, 180), 8, (20, 210, 40), -1)
        writer.write(frame)
    writer.release()
    ball = _ball_from_hint(str(path), 20, (96 / 320, 180 / 240))
    assert ball is not None
    assert abs(ball["x"] - 96) < 3
    assert abs(ball["y"] - 180) < 3
    assert ball["source"].startswith("guided_")
    assert ball["confidence"] >= 0.5


def test_sqlite_shot_round_trip(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(server, "DATABASE", tmp_path / "shots.db")
    server.initialise_database()
    shot = {"id": "shot-1", "date": "2026-09-09T00:00:00Z", "club": "7 Iron", "carry": 150}
    saved = server.save_shot(shot)
    assert saved["version"] == 12
    stored = server.list_shots()
    assert stored[0]["id"] == "shot-1"
    server.delete_shot("shot-1")
    assert server.list_shots() == []


def test_health_and_static_file_boundary():
    assert server.health()["version"] == 12
    assert Path(server.static_ui("").path).name == "index.html"
    with pytest.raises(HTTPException) as source_error:
        server.static_ui("server.py")
    assert source_error.value.status_code == 404
    with pytest.raises(HTTPException) as database_error:
        server.static_ui("burkeshot.db")
    assert database_error.value.status_code == 404
