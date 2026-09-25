# RenMonie Backend

Server-side account name verification for the RenMonie Android app.

Monnify API keys **never** go in the mobile app — only on this server.

## Contract (matches Android `AccountVerificationClient`)

```
POST /api/verify-account
Content-Type: application/json

{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

**Success**

```json
{
  "verified": true,
  "accountName": "JOHN DOE",
  "bank": "058",
  "message": "Account verified"
}
```

**Failure**

```json
{
  "verified": false,
  "accountName": "",
  "bank": "058",
  "message": "Account name could not be verified"
}
```

Also: `GET /health` → `{ "ok": true }`

## Setup

```bash
cp .env.example .env
# Edit .env with your Monnify sandbox API key + secret
npm install
npm start
```

Server listens on `PORT` (default 3000).

## Monnify

- Sandbox base: `https://sandbox.monnify.com`
- Live base: `https://api.monnify.com`
- Auth: `POST /api/v1/auth/login` (Basic apiKey:secretKey)
- Name enquiry: `GET /api/v2/disbursements/account/validate?accountNumber=&bankCode=`

## Deploy (HTTPS required by the Android app)

Deploy to Railway, Render, Fly.io, or any Node host with HTTPS.

Set env vars on the host:

- `MONNIFY_API_KEY`
- `MONNIFY_SECRET_KEY`
- `MONNIFY_MODE=sandbox` (or `live`)

Then set the Android app `BACKEND_BASE_URL` to your HTTPS URL, e.g. `https://your-app.up.railway.app`

## Local test with the phone emulator

Emulator can reach host machine at `10.0.2.2:3000`, but the app currently **requires HTTPS**.
Use a tunnel (Cloudflare Tunnel, ngrok) with HTTPS for real device testing.
