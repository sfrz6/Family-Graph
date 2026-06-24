"""
auth.py - Authentication endpoints.

This handles the simple secret-code authentication system. There are two
codes, both read from environment variables (never hardcoded, never
committed to source):
- USER_ACCESS_CODE: gives "user" role (can view and suggest)
- ADMIN_ACCESS_CODE: gives "admin" role (can manage everything)

How it works:
1. The frontend sends the entered code to POST /api/auth/login.
2. The backend compares it against the two env vars.
3. On a match, a signed JWT carrying the role is set as an HttpOnly cookie.
   The frontend never sees or stores the token itself - only the browser
   carries the cookie automatically on later requests.
4. GET /api/auth/me reads that cookie to tell the frontend who's logged in
   (e.g. after a page refresh). POST /api/auth/logout clears the cookie.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Response

from ..config import IS_PRODUCTION, USER_ACCESS_CODE, ADMIN_ACCESS_CODE
from ..schemas import AuthRequest
from ..auth_utils import COOKIE_NAME, SESSION_DAYS, create_access_token
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60


def _set_session_cookie(response: Response, role: str) -> None:
    token = create_access_token(role)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


@router.post("/login")
def login(request: AuthRequest, response: Response):
    """
    POST /api/auth/login

    Receives: {"secret_code": "some_code"}
    Sets an HttpOnly session cookie and returns: {"role": "admin"} or {"role": "user"}
    Errors: 401 if the code doesn't match either configured code.

    secrets.compare_digest avoids leaking timing information about how much
    of the code matched - unnecessary for a password this short in practice,
    but it's free to do correctly.
    """
    code = request.secret_code
    if secrets.compare_digest(code, ADMIN_ACCESS_CODE):
        role = "admin"
    elif secrets.compare_digest(code, USER_ACCESS_CODE):
        role = "user"
    else:
        raise HTTPException(status_code=401, detail="Invalid secret code")

    _set_session_cookie(response, role)
    return {"role": role}


@router.post("/logout")
def logout(response: Response):
    """POST /api/auth/logout - clears the session cookie."""
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"detail": "Logged out"}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    """GET /api/auth/me - returns the role for the current session cookie, if valid."""
    return {"role": current_user["role"]}
