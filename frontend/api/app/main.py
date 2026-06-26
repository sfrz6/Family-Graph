"""
main.py - Application entry point.

This is where everything comes together:
1. Create the FastAPI application
2. Create the database tables (if they don't exist yet)
3. Register all the route files
4. Configure CORS (so the frontend can talk to the backend)

To run this: uvicorn app.main:app --reload
That command means: "In the app package, find main.py, use the 'app' object, 
and --reload means restart automatically when I change code."
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import ALLOWED_ORIGINS
from .database import engine, Base
from .routes import auth, persons, relationship, contributions

# Create all database tables based on our models.
# If the tables already exist, this does nothing — safe to call every time.
Base.metadata.create_all(bind=engine)

# Add any columns introduced after the initial schema creation.
# ADD COLUMN IF NOT EXISTS is idempotent — safe to run on every cold start.
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE persons ADD COLUMN IF NOT EXISTS generation INTEGER"))
    _conn.execute(text("ALTER TABLE persons ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT FALSE"))
    _conn.commit()

# Create the FastAPI application instance.
app = FastAPI(
    title="Family Graph API",
    description="API for the Family Graph interactive family tree application",
    version="1.0.0",
)

# --- CORS Configuration ---
# CORS = Cross-Origin Resource Sharing
#
# By default, a browser blocks requests from one address to another.
# This is a private app, so only the configured FRONTEND_URL (see config.py,
# itself read from the FRONTEND_URL environment variable) is allowed to call
# this API from a browser. allow_credentials=True is required for the
# HttpOnly session cookie to be sent/received across origins (e.g. the
# Vite dev server talking to a separately-run local backend).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],   # Allow all HTTP methods (GET, POST, PUT, DELETE)
    allow_headers=["*"],   # Allow all headers
)


@app.middleware("http")
async def add_noindex_header(request: Request, call_next):
    """This is a private family site - tell crawlers to stay out, belt-and-suspenders
    alongside robots.txt and the frontend's <meta name="robots"> tag."""
    response = await call_next(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response

# Register route files.
# Each router adds its endpoints to the app.
# After this, the app knows about /api/auth/login, /api/persons, etc.
app.include_router(auth.router)
app.include_router(persons.router)
app.include_router(relationship.router)
app.include_router(contributions.router)


@app.get("/")
def root():
    """
    GET /
    
    A simple health check endpoint.
    If you open http://localhost:8000 in a browser, you'll see this response.
    Useful to verify the server is running.
    """
    return {"message": "Family Graph API is running"}
