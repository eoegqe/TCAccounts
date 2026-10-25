# TC Accounts

React/Vite frontend with a Cloudflare Worker API and Cloudflare D1 database binding named `TC`.

API routes: `GET /api/health`, `POST /api/register`, `POST /api/login`, `GET /api/me`, `POST /api/logout`, and authenticated `GET /api/accounts`.

Passwords use PBKDF2-SHA-256; random session tokens are stored only as SHA-256 hashes and delivered as Secure, HttpOnly, SameSite=Lax cookies. Unauthenticated visitors to `/accounts` are prompted to sign in.

The manually created `users` table must have integer `id`, `username`, `email`, `password_hash`, `email_verified_at`, `status`, `created_at`, and `updated_at` columns. The migration creates the other tables and unique username/email indexes. Do not drop or recreate the manually created table.

Apply the migration only after confirming the existing users table has those columns: `npx wrangler d1 migrations apply TC --remote`.

The Worker must be deployed and routed to the frontend's same origin under `/api/*`. For a different frontend origin, set `ALLOWED_ORIGINS` to the exact origin and configure cookies for that deployment. Email verification, password reset, and server-side rate limiting are not implemented yet.
