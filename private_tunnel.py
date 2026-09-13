from __future__ import annotations

import base64
import hmac
import os

import uvicorn
from fastapi import Request
from fastapi.responses import Response

import server

# Make the PWA files available through the existing static route.
server.PUBLIC_FILES.update({"manifest.webmanifest", "sw.js", "pwa-install.js"})

USERNAME = os.environ.get("BURKESHOT_PRIVATE_USER", "burkeshot")
PASSWORD = os.environ.get("BURKESHOT_PRIVATE_PASSWORD", "")

if not PASSWORD:
    raise SystemExit("BURKESHOT_PRIVATE_PASSWORD is required")

@server.app.middleware("http")
async def basic_auth(request: Request, call_next):
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            raw = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
            user, password = raw.split(":", 1)
            if hmac.compare_digest(user, USERNAME) and hmac.compare_digest(password, PASSWORD):
                return await call_next(request)
        except Exception:
            pass
    return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="BurkeShot Private"'})

if __name__ == "__main__":
    print("\nBURKESHOT PRIVATE HTTPS MODE")
    print(f"Username: {USERNAME}")
    print("Keep this window open while testing on your phone.\n")
    uvicorn.run(server.app, host="127.0.0.1", port=8811, log_level="warning")
