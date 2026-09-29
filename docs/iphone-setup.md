# iPhone setup

You need your function URL (`https://me-west1-<your-project-id>.cloudfunctions.net/openGateHttp`) and one
personal secret per person (from `tools/mint_secret.py`).

## 1. Build the shortcut

1. Open the **Shortcuts** app, tap **+**, then **Add Action**, and search for **Get Contents of URL**.
2. Tap the URL field and paste your function URL.
3. Tap the arrow (**Show More**):
   - **Method:** `GET`
   - **Headers:** tap **Add new header**. Key `Authorization`, value `Bearer <the secret>`
     (the word `Bearer`, a space, then the secret).
4. Optional feedback: add **Get Dictionary Value** (key `status`, from *Contents of URL*), then
   **Show Notification** with that value. Skip it if you want the shortcut to be silent.
5. Rename the shortcut to **Open the gate**. The name is the Siri phrase.
6. Tap the shortcut once. The gate should open.

## 2. Choose how to trigger it

| Trigger | How to set it up |
|---|---|
| **"Hey Siri, open the gate"** | Settings > **Siri**: turn on **Listen for "Siri" or "Hey Siri"**. For hands-free use in the car, also turn on **Allow Siri When Locked**. Works with CarPlay. |
| **Home-screen widget** | Long-press the home screen, tap **Edit** > **Add Widget** > **Shortcuts**, pick the single-shortcut size and choose *Open the gate*. |
| **Action Button** (iPhone 15 Pro and later) | Settings > **Action Button** > **Shortcut** > *Open the gate*. |
| **Control Center** (iOS 18+) | Open Control Center, tap **+** > **Add a Control** > **Shortcut**. |
| **Apple Watch** | In the shortcut's details, turn on **Show on Apple Watch**. |

## 3. Share with your family

Make a separate copy for each person, with **their own** secret, so you can revoke one phone without
affecting the others.

- Share it by **AirDrop**, **not** "Copy iCloud Link". An iCloud link uploads the shortcut, secret
  included, and anyone who has the link can install it.
- On their phone: tap **Add Shortcut**, then set up Siri or the widget as above.

## Android

Use a free HTTP-shortcut app (for example **HTTP Request Shortcuts**): create a `GET` request to the same
URL with the header `Authorization: Bearer <secret>`, and put it on the home screen. For voice, trigger it
from a Google Assistant routine.

## What the endpoint returns

| Response | Meaning |
|---|---|
| `200 {"status":"succeeded"}` | The gate opened. |
| `200 {"status":"failed", "reason":"..."}` | It did not open. Safe to try again. |
| `200 {"status":"uncertain", "reason":"..."}` | It may have opened. Look before trying again. |
| `200 {"status":"in-progress"}` | Another open is running right now. |
| `404` | Wrong, missing or revoked secret. |
