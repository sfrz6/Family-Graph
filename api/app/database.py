"""
database.py - Database connection and session management.

This file does three things:
1. Creates the connection to our PostgreSQL database (e.g. a Neon database).
2. Sets up a "session factory" — every time the API needs to talk to the database,
   it creates a session, does its work, and closes the session.
3. Provides a 'get_db' function that FastAPI uses to automatically manage sessions.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DATABASE_URL

# DATABASE_URL comes from the environment (see config.py) - in production this
# is the Postgres connection string Neon gives you, e.g.
# postgresql://user:password@host/dbname?sslmode=require
#
# pool_pre_ping checks a pooled connection is still alive before using it,
# which matters for serverless: Neon (and most managed Postgres) can close
# idle connections, and a function container can be reused across requests.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

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
