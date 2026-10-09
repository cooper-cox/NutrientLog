"""Anonymous-user tokens.

Each device gets a long random token when its user is created. The server keeps only a hash of
it (like a password), so a leaked database does not leak working tokens.
"""

import hashlib
import secrets


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
