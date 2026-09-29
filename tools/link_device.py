#!/usr/bin/env python3
"""Link a new device to your PalGate account and print the session token.

Uses PalGate's official "Linked Devices" feature (the same flow pylgate / ha-palgate use):

    python link_device.py

It prints a QR code in the terminal (and saves link_qr.png). Open the PalGate app ->
menu -> Linked Devices -> Link a device -> scan the QR. Once scanned, this prints your
phone number and session token. Next step: `python poc_palgate.py check`.

SECURITY: the session token opens your gate. Never commit it or paste it anywhere public.
"""
from __future__ import annotations

import json
import sys
import time
import uuid

import requests

# Windows consoles default to cp1252; the QR uses block chars and names may be Hebrew.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    import qrcode
except ImportError:
    sys.exit("Install deps first:  pip install -r requirements.txt")

INIT_URL = "https://api1.pal-es.com/v1/bt/un/secondary/init/"
POLL_TIMEOUT_S = 180
POLL_INTERVAL_S = 2


def main() -> None:
    code = str(uuid.uuid4())
    payload = json.dumps({"id": code})

    qr = qrcode.QRCode(border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    print("\nScan this in PalGate -> Linked Devices -> Link a device:\n")
    qr.print_ascii(invert=True)
    try:
        qr.make_image().save("link_qr.png")
        print("(also saved as link_qr.png if the terminal QR is hard to scan)\n")
    except Exception:
        pass

    print("Waiting for you to scan", end="", flush=True)
    deadline = time.time() + POLL_TIMEOUT_S
    while time.time() < deadline:
        try:
            resp = requests.get(INIT_URL + code, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                user = data.get("user") or {}
                if user.get("token"):
                    print("\n\n=== LINKED ===")
                    print("phone number :", user.get("id"))
                    print("token type   :", data.get("secondary"), "(2 = secondary/linked)")
                    print("status       :", data.get("status"))
                    print("session token:", user.get("token"))
                    print("\nNext: set PALGATE_SESSION_TOKEN and PALGATE_PHONE, then run: python poc_palgate.py check")
                    return
        except (requests.RequestException, json.JSONDecodeError):
            pass  # not scanned yet / transient
        print(".", end="", flush=True)
        time.sleep(POLL_INTERVAL_S)

    print("\nTimed out waiting for the scan. Re-run to try again.")
    sys.exit(1)


if __name__ == "__main__":
    main()
