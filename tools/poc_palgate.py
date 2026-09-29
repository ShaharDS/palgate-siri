#!/usr/bin/env python3
"""Talk to the PalGate API from your computer, to test your token before deploying anything.

  python poc_palgate.py check                    # validate the token (and detect its type)
  python poc_palgate.py devices                  # list your gates -> copy your gate's device id
  python poc_palgate.py open --device <ID>       # open the gate once (it really opens!)

Reads your credentials from environment variables (from link_device.py):
  PALGATE_SESSION_TOKEN   the session token (hex)
  PALGATE_PHONE           your phone number in international format, e.g. 9725XXXXXXXX
  PALGATE_TOKEN_TYPE      optional: 1 = primary, 2 = linked device. `check` finds it for you.

SECURITY: the session token opens your gate. Never commit it or paste it anywhere public.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import requests
from pylgate import generate_token

# Windows consoles default to cp1252; gate names may be Hebrew. Force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SESSION_TOKEN = os.environ.get("PALGATE_SESSION_TOKEN", "").strip()
PHONE_NUMBER = os.environ.get("PALGATE_PHONE", "").strip()
TOKEN_TYPE_ENV = os.environ.get("PALGATE_TOKEN_TYPE", "").strip()
TOKEN_TYPE = int(TOKEN_TYPE_ENV or "1")  # 0 = SMS, 1 = primary, 2 = linked device

BASE_URL = "https://api1.pal-es.com/v1/bt"
USER_AGENT = "BlueGate/115 CFNetwork/1128.0.1 Darwin/19.6.0"


def _headers(token_type: int = TOKEN_TYPE) -> dict:
    token = generate_token(bytes.fromhex(SESSION_TOKEN), int(PHONE_NUMBER), token_type)
    return {"x-bt-token": token, "User-Agent": USER_AGENT, "Accept": "*/*",
            "Content-Type": "application/json"}


def _guard() -> None:
    if not SESSION_TOKEN or not PHONE_NUMBER:
        sys.exit("Set PALGATE_SESSION_TOKEN and PALGATE_PHONE first (run link_device.py to get them).")


def _report(resp: requests.Response) -> bool:
    """Print result; return True on success (HTTP 200 and body has no truthy `err`)."""
    ok = False
    try:
        data = resp.json()
        err = data.get("err")
        ok = resp.status_code == 200 and not err
        print(f"HTTP {resp.status_code}  err={err!r}  ->  {'SUCCESS' if ok else 'FAIL'}")
        print("  body:", str(data)[:400])
    except ValueError:
        print(f"HTTP {resp.status_code}  (non-JSON body): {resp.text[:400]}")
    return ok


def cmd_check() -> None:
    _guard()
    # If the type wasn't given, try each one: a wrong type is the most common "wrong token" error.
    for t in ([TOKEN_TYPE] if TOKEN_TYPE_ENV else [1, 2, 0]):
        print(f"token type {t}: ", end="")
        if _report(requests.get(f"{BASE_URL}/user/check-token", headers=_headers(t), timeout=15)):
            print(f"\nYour token works. Token type = {t}  (use PALGATE_TOKEN_TYPE={t})")
            return
    sys.exit("\nToken rejected. Re-run link_device.py to get a fresh session token.")


def cmd_devices() -> None:
    _guard()
    resp = requests.get(f"{BASE_URL}/devices", headers=_headers(), timeout=15)
    try:
        # Full output (not truncated) so every gate's device id is visible.
        print(json.dumps(resp.json(), ensure_ascii=False, indent=2))
    except ValueError:
        _report(resp)


def cmd_open(device_id: str, repeat: int) -> None:
    _guard()
    ok = 0
    for i in range(repeat):
        url = f"{BASE_URL}/device/{device_id}/open-gate?openBy=100&outputNum=1"
        r = requests.get(url, headers=_headers(), timeout=15)  # fresh time-based token each call
        print(f"[{i + 1}/{repeat}] ", end="")
        if _report(r):
            ok += 1
        if i + 1 < repeat:
            time.sleep(2)
    print(f"\nSuccess: {ok}/{repeat}")


def main() -> None:
    p = argparse.ArgumentParser(description="PalGate API test tool")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    sub.add_parser("devices")
    po = sub.add_parser("open")
    po.add_argument("--device", required=True)
    po.add_argument("--repeat", type=int, default=1)
    args = p.parse_args()

    if args.cmd == "check":
        cmd_check()
    elif args.cmd == "devices":
        cmd_devices()
    elif args.cmd == "open":
        cmd_open(args.device, args.repeat)


if __name__ == "__main__":
    main()
