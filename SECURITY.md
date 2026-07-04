# Security Policy

## Reporting a vulnerability

If you discover a security issue in Wanderlore, please report it privately rather
than opening a public issue:

- Use GitHub's **[Report a vulnerability](../../security/advisories/new)** (Security → Advisories), or
- Email the maintainer.

Please include steps to reproduce and the affected route/component. We aim to
acknowledge reports within 72 hours.

## Handling of secrets

- All third-party keys (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `RESEND_API_KEY`) are **server-only** and read from environment variables. They are
  never exposed to the client and never committed.
- `.env*` files are git-ignored; `.env.example` contains placeholder names only.
- Supabase reads/writes use the service-role key on the server exclusively; the
  client never talks to the database directly.

## Application security measures

- Strict **Content-Security-Policy** and hardening headers on every response
  (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`). Image origins are limited to OpenStreetMap tiles and
  Wikimedia; scripts/styles are `self`.
- All user and model-supplied text is HTML-escaped before being embedded in emails.
- Input is validated and length-bounded server-side before any external call.
- External data fetches (Gemini, OpenStreetMap, Wikipedia, Resend) happen only on
  the server, never from the browser.

## Supported versions

Only the latest deployed version on the `main` branch is supported.
