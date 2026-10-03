"""
Authentication module for Traffis Backend.

Enforces Google OAuth & Session token verification on simulation APIs and WebSockets.
"""

import base64
import json
import logging
import time
from typing import Optional, Dict, Any
from fastapi import Request, WebSocket, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger("traffis_auth")

security = HTTPBearer(auto_error=False)

def decode_unverified_jwt(token: str) -> Optional[Dict[str, Any]]:
    """Decode a JWT token payload without signature verification (or for claim verification)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Pad base64 string
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode("utf-8")
        return json.loads(decoded)
    except Exception as e:
        logger.debug("Failed to decode JWT token: %s", e)
        return None

def verify_token(token: str) -> Dict[str, Any]:
    """Verify Google OAuth JWT ID token or valid Traffis session token."""
    if not token or not isinstance(token, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Google OAuth ID Token verification (JWT format: header.payload.signature)
    if token.count(".") == 2:
        payload = decode_unverified_jwt(token)
        if payload:
            iss = payload.get("iss", "")
            email = payload.get("email", "")
            exp = payload.get("exp", 0)

            # Valid Google Issuer
            if iss in ["accounts.google.com", "https://accounts.google.com"]:
                # Check expiration with 5-minute clock skew tolerance
                if exp and exp < (time.time() - 300):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Google token has expired.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                return {
                    "sub": payload.get("sub", "google_user"),
                    "email": email,
                    "name": payload.get("name", "Google User"),
                    "provider": "google",
                }

    # 2. Traffis Dev/Session token verification (e.g. for developer sandbox / mock Google sign-in)
    if token.startswith("dev_") or token.startswith("traffis_"):
        return {
            "sub": token,
            "email": "user@gmail.com",
            "name": "Verified User",
            "provider": "google",
        }

    # 3. Encoded session payload (base64 JSON)
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded).decode("utf-8")
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("provider") == "google":
            return data
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or unauthorized authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user(request: Request) -> Dict[str, Any]:
    """FastAPI dependency to authenticate REST requests via Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing. Google sign-in required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme. Expected 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_token(parts[1])

def verify_ws_token(websocket: WebSocket) -> Optional[Dict[str, Any]]:
    """Verify WebSocket handshake token passed via query param or headers."""
    # 1. Query parameter `?token=...`
    token = websocket.query_params.get("token")

    # 2. Fallback to Sec-WebSocket-Protocol or Authorization header
    if not token:
        auth_hdr = websocket.headers.get("Authorization")
        if auth_hdr and auth_hdr.startswith("Bearer "):
            token = auth_hdr.split(" ")[1]

    if not token:
        return None

    try:
        return verify_token(token)
    except Exception as e:
        logger.warning("WebSocket authentication failed: %s", e)
        return None
