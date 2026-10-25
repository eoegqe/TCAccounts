# TC central database

This D1 database is named `TC` and is initially connected to the TCAccounts Worker through the `TC` binding.

## Apply the initial schema

From the repository root, with Wrangler installed and authenticated:

```sh
npx wrangler d1 migrations apply TC --remote
```

For local development, use:

```sh
npx wrangler d1 migrations apply TC --local
```

The initial schema includes TC Accounts users, sessions, verification and recovery tokens, registered applications, connected accounts, and audit logs.

The API currently exposes only `GET /api/health` to verify that the Worker can query D1. Registration and login are intentionally not enabled until password hashing, email delivery, rate limiting, session cookies, and recovery flows are implemented and tested.

Never store plaintext passwords, session tokens, verification tokens, or password-reset tokens. Store only password hashes or hashes of random tokens.
