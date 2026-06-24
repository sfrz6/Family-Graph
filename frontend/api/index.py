"""
index.py - Vercel serverless entrypoint.

Vercel's Python runtime discovers files under /api and looks for an
ASGI-compatible `app` object to serve. The actual FastAPI app lives in
app/main.py (same layout as before, just relocated so the entrypoint
sits where Vercel expects it).

The bundled function preserves the repo-relative path (Vercel loads this
file as /var/task/api/index.py with /var/task on sys.path), so the app
package has to be addressed as api.app, not app - a bare "from app.main
import app" raises ModuleNotFoundError at runtime even though it works
fine when run locally from inside the api/ directory.
"""

from api.app.main import app
