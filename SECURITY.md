# Security

## Reporting a problem

Please don't open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/ShaharDS/palgate-siri/security/advisories/new) instead.

## Keeping your deployment safe

- **Never commit** your session token, phone number, `functions/.env` or the per-person secrets.
  `.gitignore` already excludes the usual files, but check `git status` before every commit anyway.
- **If a phone is lost**, set its entry's `active` to `false` in Firestore `config/openGateSecrets`.
- **If your PalGate session token leaks**, remove the linked device in the PalGate app
  (**menu > Linked Devices**), link a new one with `tools/link_device.py`, then run
  `firebase functions:secrets:set PALGATE_SESSION_TOKEN` and `firebase deploy --only functions`.
- Share shortcuts by **AirDrop**, never by iCloud link. The shortcut contains the secret.
