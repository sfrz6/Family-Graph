"""
dependencies.py - FastAPI dependencies for reading the session cookie.

- get_current_user: requires a valid JWT cookie, any role. Use this on any
  endpoint that should only be reachable while logged in (viewing the graph,
  searching relationships, submitting a contribution).
- require_admin: builds on get_current_user, additionally requires role
  "admin". Use this on anything that mutates the approved family tree
  (add/edit/delete person, manage relationships, approve/reject contributions).
"""

import jwt
from fastapi import Depends, HTTPException, Request

from .auth_utils import COOKIE_NAME, decode_access_token


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return payload


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
