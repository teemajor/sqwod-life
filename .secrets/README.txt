SQWOD CONTENT ENGINE — SECRETS
================================
This folder holds the API key the weekly content agent reads at runtime.
The key is NEVER stored in the task prompt, chat, or memory — only here.

SETUP (one time):
1. Create a Google AI Studio / Gemini API key with a BUDGET CAP
   (recommended: a low monthly cap, e.g. $5–10 — covers ~125–250 covers).
2. Open .secrets/gemini.key and REPLACE the placeholder line with the key only
   (one line, no quotes, no spaces).
3. Save. Done.

The agent treats the key as "not set" while it still says PASTE_YOUR_CAPPED_GEMINI_KEY_HERE,
and will skip image generation (text-only) until a real key is present.

SECURITY:
- Revoke the old throwaway key used during the June cover batch.
- This is a dedicated, capped key — rotate it anytime by editing this file.
- Keep this .secrets folder out of any public sync/repo.
