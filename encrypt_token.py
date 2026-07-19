#!/usr/bin/env python3
"""
Encrypt a GitHub token (or any secret) using AES-256-GCM.
Usage: python encrypt_token.py
"""

import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt_token(token: str, password: str) -> dict:
    """Encrypt a token using AES-256-GCM with a password-derived key."""
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes

    # Generate a random salt
    salt = os.urandom(16)

    # Derive a 256-bit key from the password
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,  # NIST recommended minimum
    )
    key = kdf.derive(password.encode())

    # Encrypt with AES-256-GCM
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, token.encode(), None)

    return {
        "salt":       base64.b64encode(salt).decode(),
        "nonce":      base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
    }


def decrypt_token(encrypted: dict, password: str) -> str:
    """Decrypt a token encrypted with encrypt_token()."""
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes

    salt       = base64.b64decode(encrypted["salt"])
    nonce      = base64.b64decode(encrypted["nonce"])
    ciphertext = base64.b64decode(encrypted["ciphertext"])

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
    )
    key = kdf.derive(password.encode())

    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()


if __name__ == "__main__":
    import json
    import getpass

    print("=== GitHub Token Encryptor (AES-256-GCM) ===\n")

    token    = getpass.getpass("Paste your GitHub token (input hidden): ")
    password = getpass.getpass("Choose an encryption password:           ")
    confirm  = getpass.getpass("Confirm password:                         ")

    if password != confirm:
        print("ERROR: Passwords do not match.")
        exit(1)

    encrypted = encrypt_token(token, password)

    print("\n✅ Encrypted token (save this JSON safely):\n")
    print(json.dumps(encrypted, indent=2))

    # Verify round-trip
    recovered = decrypt_token(encrypted, password)
    assert recovered == token, "Round-trip verification failed!"
    print("\n✅ Verification passed — decryption works correctly.")
    print("\n⚠️  Store the JSON above in a secrets manager or vault.")
    print("   NEVER store it alongside the password.")
