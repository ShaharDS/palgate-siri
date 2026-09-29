# Troubleshooting

Start with the logs:

```bash
firebase functions:log --only openGateHttp
```

The Firestore documents `gate/state` and `history` show the last result and its `reason`.

## The shortcut gets `404`

- The secret in the shortcut doesn't match an **active** entry in `config/openGateSecrets`. Check for a
  missing `Bearer ` prefix, a missing space, or a truncated secret.
- After editing `config/openGateSecrets`, allow up to a minute. Each function instance caches the list.

## `status: failed`

| `reason` | What to do |
|---|---|
| `token-invalid` | PalGate rejected your credentials. The linked device was probably removed in the PalGate app. Run `tools/link_device.py` again, then `firebase functions:secrets:set PALGATE_SESSION_TOKEN` and `firebase deploy --only functions`. |
| `http-4xx` | Wrong `PALGATE_DEVICE_ID`, or your account lost access to that gate. |
| `api-error` | PalGate answered with an error (for example, no permission at this time). |
| `network-before-send` | The function couldn't reach PalGate. Try again. |

## `status: uncertain`

The request may have reached the gate, so look before you retry. Common reasons: `network-after-send`
(timeout), `http-5xx` (PalGate server error), `lease-expired` (the function died mid-call). If
`api-schema-changed` or `not-confirmed` keeps appearing, PalGate may have changed its API. Check
[pylgate](https://github.com/DonutByte/pylgate) for an update.

## `poc_palgate.py check` says the token is wrong

Leave `PALGATE_TOKEN_TYPE` unset. `check` then tries each token type and tells you which one works. Use
that value in `functions/.env`.

## The first open is slow

That's a cold start (1-3 s) after a quiet period, part of staying free. To avoid it, set
`minInstances: 1` in `functions/src/openGateHttp.ts` and redeploy (about $3-8 a month).

## Deploy problems

- **`No value for PALGATE_DEVICE_ID`** (or another param): `functions/.env` is missing or incomplete.
  Copy it from `functions/.env.example`.
- **Secret Manager or billing errors:** the project isn't on the Blaze plan yet.
- **`fetch failed` during "discovering functions"**, or a `409` while creating resources: usually
  transient. Run the deploy again.

## Testing from Windows

In Windows PowerShell, `curl` is an alias for a different command. Use `curl.exe`, or:

```powershell
Invoke-RestMethod -Uri "<function-url>" -Headers @{ Authorization = "Bearer <secret>" }
```
