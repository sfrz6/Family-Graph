"""
database.py - Database connection and session management.

This file does three things:
1. Creates the connection to our SQLite database file.
2. Sets up a "session factory" — every time the API needs to talk to the database,
   it creates a session, does its work, and closes the session.
3. Provides a 'get_db' function that FastAPI uses to automatically manage sessions.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# DATABASE_URL tells SQLAlchemy where the database file is.
# "sqlite:///" means we're using SQLite, and "./family.db" is the file path.
# The file will be created automatically the first time we run the app.
DATABASE_URL = "sqlite:///./family.db"

# The "engine" is the core connection to the database.
# connect_args={"check_same_thread": False} is needed for SQLite specifically —
# it allows multiple requests to use the database at the same time.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# SessionLocal is a factory that creates new database sessions.
# A "session" is like opening a conversation with the database —
# you can read, write, and when you're done, you close it.
# autocommit=False means changes aren't saved until we explicitly say so.
# autoflush=False means data isn't sent to the DB until we explicitly say so.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is the parent class for all our database models (tables).
# Every table we define will inherit from this.
Base = declarative_base()


def get_db():
    """
    This function is used by FastAPI as a "dependency".
    
    When an API endpoint needs the database, FastAPI calls this function,
    which creates a fresh session, gives it to the endpoint, and ensures
    the session is closed when the endpoint is done — even if an error occurs.
    
    The 'yield' keyword makes this a generator:
    - Everything before 'yield' runs BEFORE the endpoint.
    - Everything after 'yield' runs AFTER the endpoint (cleanup).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
