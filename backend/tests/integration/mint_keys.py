"""Print the harness JSON: {url, anonKey, serviceRoleKey, users: {name: {id, jwt}}}.

Env: URL (PostgREST root), JWT_SECRET (HS256, as Supabase), USERS ("<uuid> <email-local-part>" per line),
optional ANON_KEY / SERVICE_ROLE_KEY to pass through instead of minting (real Supabase stack).
Standard library only. Run with `python3 -I`.
"""
import base64
import hashlib
import hmac
import json
import os
import time

secret = os.environ["JWT_SECRET"].encode()


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def jwt(claims: dict) -> str:
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = b64(hmac.new(secret, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


now = int(time.time())
users = {}
for line in os.environ["USERS"].splitlines():
    if not line.strip():
        continue
    uid, local = line.split(" ", 1)
    users[local.replace(".", "_")] = {
        "id": uid,
        "jwt": jwt({"sub": uid, "role": "authenticated", "aud": "authenticated", "iat": now, "exp": now + 7 * 86400}),
    }

print(json.dumps({
    "url": os.environ["URL"],
    "anonKey": os.environ.get("ANON_KEY") or jwt({"role": "anon", "iss": "hearth-harness", "iat": now, "exp": now + 365 * 86400}),
    "serviceRoleKey": os.environ.get("SERVICE_ROLE_KEY")
        or jwt({"role": "service_role", "iss": "hearth-harness", "iat": now, "exp": now + 365 * 86400}),
    "users": users,
}, indent=2))
