"""
auth.py - Authentication endpoints.

This handles the simple secret code authentication system.
There are two codes:
- USER_CODE: gives "user" role (can view and suggest)
- ADMIN_CODE: gives "admin" role (can manage everything)

How it works:
1. User sends a secret code to /api/auth/login
2. Backend checks if it matches either code
3. If yes, returns the role ("user" or "admin")
4. The frontend stores this role and sends it with future requests

NOTE: This is intentionally simple. In a production app, you'd use
JWT tokens, sessions, or OAuth. But for a family project with secret
codes, this is practical and sufficient.

IMPORTANT: In a real deployment, change these codes and ideally
load them from environment variables, not hardcoded in the source.
"""

from fastapi import APIRouter, HTTPException
from ..schemas import AuthRequest

# APIRouter groups related endpoints together.
# prefix="/api/auth" means all routes here start with /api/auth
# tags=["auth"] groups them in the API documentation
router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- Secret Codes ---
# Change these to your own codes before sharing with family!
USER_CODE = "family2024"
ADMIN_CODE = "admin2024"


@router.post("/login")
def login(request: AuthRequest):
    """
    POST /api/auth/login
    
    Receives: {"secret_code": "some_code"}
    Returns: {"role": "admin"} or {"role": "user"}
    Errors: 401 if the code is wrong
    
    The @router.post decorator tells FastAPI:
    - This function handles POST requests (sending data)
    - At the path /login (combined with prefix = /api/auth/login)
    
    FastAPI automatically:
    - Parses the JSON body into an AuthRequest object
    - Validates it has a 'secret_code' field
    - Returns 422 if the data format is wrong
    """
    if request.secret_code == ADMIN_CODE:
        return {"role": "admin"}
    elif request.secret_code == USER_CODE:
        return {"role": "user"}
    else:
        # HTTPException sends an error response.
        # 401 = "Unauthorized" — standard code for failed authentication.
        raise HTTPException(status_code=401, detail="Invalid secret code")
