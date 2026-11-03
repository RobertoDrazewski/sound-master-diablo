import hashlib
import hmac
import os
import secrets
import time
from datetime import timedelta

import jwt

from .config import JWT_TTL_DAYS, LINK_TTL, SECRET_KEY
from .db import now

ALGO = "HS256"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, hash_hex = stored.split("$")
        h = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(h.hex(), hash_hex)
    except Exception:
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_secret(prefix: str = "") -> str:
    return prefix + secrets.token_urlsafe(32)


def create_session_jwt(user_id: int) -> str:
    exp = now() + timedelta(days=JWT_TTL_DAYS)
    return jwt.encode({"sub": str(user_id), "scope": "session", "exp": exp}, SECRET_KEY, ALGO)


def decode_session_jwt(token: str) -> int | None:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        if data.get("scope") != "session":
            return None
        return int(data["sub"])
    except Exception:
        return None


def create_media_token(user_id: int, version_id: int, fmt: str) -> str:
    """Token de corta vida para <audio> y descargas, atado a una version y formato."""
    payload = {"sub": str(user_id), "scope": "media", "vid": version_id, "fmt": fmt,
               "exp": int(time.time()) + LINK_TTL}
    return jwt.encode(payload, SECRET_KEY, ALGO)


def decode_media_token(token: str, version_id: int, fmt: str) -> int | None:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        if data.get("scope") != "media" or data.get("vid") != version_id or data.get("fmt") != fmt:
            return None
        return int(data["sub"])
    except Exception:
        return None


class LoginThrottle:
    """Limita intentos fallidos por clave (email+ip). En memoria, suficiente para un solo proceso."""

    def __init__(self, max_fails: int = 5, window: int = 300):
        self.max_fails = max_fails
        self.window = window
        self.fails: dict[str, list[float]] = {}

    def _clean(self, key: str) -> list[float]:
        t = time.time()
        arr = [x for x in self.fails.get(key, []) if t - x < self.window]
        self.fails[key] = arr
        return arr

    def blocked(self, key: str) -> bool:
        return len(self._clean(key)) >= self.max_fails

    def fail(self, key: str):
        self._clean(key).append(time.time())

    def ok(self, key: str):
        self.fails.pop(key, None)


throttle = LoginThrottle()
