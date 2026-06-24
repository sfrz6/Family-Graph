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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routes import auth, persons, relationship, contributions

# Create all database tables based on our models.
# If the tables already exist, this does nothing — safe to call every time.
Base.metadata.create_all(bind=engine)

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
# Our frontend (React) will run on http://localhost:3000
# Our backend (FastAPI) will run on http://localhost:8000
# Without CORS, the browser would block the frontend from calling the backend.
#
# This middleware tells the browser: "It's okay, allow requests from these origins."
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],   # Allow all HTTP methods (GET, POST, PUT, DELETE)
    allow_headers=["*"],   # Allow all headers
)

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
