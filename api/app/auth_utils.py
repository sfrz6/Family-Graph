"""
auth_utils.py - JWT creation and verification.

The token only ever carries a role ("user" or "admin") - there are no
per-person accounts in this app, just two shared secret codes. The token
is signed with JWT_SECRET (from the environment, see config.py) and is
only ever transmitted inside an HttpOnly cookie, never read by JS.
"""

from datetime import datetime, timedelta, timezone

import jwt

from .config import JWT_SECRET

ALGORITHM = "HS256"
SESSION_DAYS = 30
COOKIE_NAME = "access_token"


def create_access_token(role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "role": role,
        "iat": now,
        "exp": now + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError (expired, invalid signature, malformed, ...) on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
