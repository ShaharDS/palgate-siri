#!/usr/bin/env python3
"""Create a personal secret for one person who may open the gate.

  python mint_secret.py alex

Prints:
  - the SECRET  -> goes into that person's Apple Shortcut (Authorization: Bearer <secret>).
                   Shown once; the server never stores it.
  - the entry   -> {label, sha256, active} for the allowlist: put it in OPEN_GATE_SECRETS in
                   functions/.env (first setup), or add it to the Firestore doc
                   config/openGateSecrets (any time later, no redeploy).

To revoke that person later, set their entry's "active" to false in config/openGateSecrets.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sys


def main() -> None:
    label = sys.argv[1] if len(sys.argv) > 1 else "person"
    secret = secrets.token_hex(32)  # 256-bit
    digest = hashlib.sha256(secret.encode("utf-8")).hexdigest()

    print(f"\nlabel : {label}")
    print(f"SECRET (put it in {label}'s shortcut; it is shown only once):\n  {secret}")
    print("\nAllowlist entry (functions/.env OPEN_GATE_SECRETS, or Firestore config/openGateSecrets):")
    print("  " + json.dumps({"label": label, "sha256": digest, "active": True}))
    print()


if __name__ == "__main__":
    main()
