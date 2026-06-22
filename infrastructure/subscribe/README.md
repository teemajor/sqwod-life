# Sqwod subscribe — capture Worker

Adds newsletter sign-ups to a Resend **segment** (the same ID the Daily is
broadcast to). Keeps the Resend API key server-side. Pairs with
`automation/send.mjs` (which sends to that segment).

## How it fits

```
subscribe form (site)  →  POST /subscribe (this Worker)  →  Resend contact (segment EN/DE)
                                                                     │
automation/send.mjs  →  Resend Broadcast → segment_id  ←────────────┘
```

The form's `RESEND_AUDIENCE_EN/DE` (used by send.mjs) and this Worker's
`RESEND_SEGMENT_EN/DE` must be the **same segment IDs**.

## Deploy

```bash
cd infrastructure/subscribe
npm i -g wrangler          # if not installed
wrangler login
# fill RESEND_SEGMENT_EN / _DE in wrangler.toml
wrangler secret put RESEND_API_KEY
wrangler deploy
```

Note the deployed URL (e.g. `https://sqwod-subscribe.<you>.workers.dev`) or set a
custom domain in `wrangler.toml` (e.g. `join.sqwod.life`). Then put that URL in
`site/src/config/subscribe.ts` as `endpoint`.

## Endpoint

`POST /subscribe` — accepts a posted form **or** JSON `{ email, lang, company? }`.
`company` is a honeypot (bots that fill it get a silent success). Native form
posts get a 303 redirect to `/{lang}/subscribe?status=ok|error`; `fetch` callers
get JSON `{ ok }`.

## Test

```bash
curl -X POST https://<worker-url>/subscribe \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","lang":"en"}'
# → {"ok":true}  and the contact appears in your EN segment
```
