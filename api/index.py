"""
index.py - Vercel serverless entrypoint.

Vercel's Python runtime discovers files under /api and looks for an
ASGI-compatible `app` object to serve. The actual FastAPI app lives in
app/main.py (same layout as before, just relocated so the entrypoint
sits where Vercel expects it).
"""

from app.main import app
