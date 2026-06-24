"""
config.py - Required environment variables, validated at startup.

Reads every secret/setting the app needs from the environment and fails
immediately and clearly if something required is missing, instead of
letting the app start in a broken state and fail confusingly later on
the first request.

Locally, python-dotenv loads a .env file if one exists (load_dotenv is a
no-op when there's no .env, so this is safe in production on Vercel where
real environment variables are injected directly).
"""

import os
from dotenv import load_dotenv

load_dotenv()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Set it in your .env file (local development) or in your "
            f"Vercel project's Environment Variables settings (production)."
        )
    return value


DATABASE_URL = require_env("DATABASE_URL")
JWT_SECRET = require_env("JWT_SECRET")
USER_ACCESS_CODE = require_env("USER_ACCESS_CODE")
ADMIN_ACCESS_CODE = require_env("ADMIN_ACCESS_CODE")

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# Comma-separated list of allowed frontend origins for CORS.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_URL.split(",") if origin.strip()]
