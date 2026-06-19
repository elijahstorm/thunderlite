# DontCode platform boundary

Everything ThunderLite knows about the DontCode platform lives in this
directory — nothing elsewhere in the app talks to the platform directly.
The platform contract is consumed through the official
[`@dontcode2/backend`](https://backend.dontcode.co/en/docs/byoc) SDK; the
files here are thin app-shaped adapters over it, not hand-rolled HTTP.

| File         | Wraps / role                              | Surface                                                    |
| ------------ | ----------------------------------------- | ---------------------------------------------------------- |
| `server.ts`  | `dontcode()` client (auth / db / storage) | `db` (structured queries), `auth`, `storage`, `migrate`    |
| `client.ts`  | browser session stores                    | `loggedIn` / `userAuth` stores, `refreshSession`, `logout` |
| `cookies.ts` | SvelteKit cookie glue                      | `access_token` cookie helpers for SvelteKit endpoints      |

`server.ts` keeps an app-friendly surface on top of the SDK: positional
`db.find(table, opts)` calls plus the `insertIgnoreConflict` / `upsert`
idempotency helpers (built on the SDK's 409 conflict signal), and an
`auth` wrapper that converts the SDK's thrown sub-500 `DontCodeError`s back
into in-band `{ success: false, code }` results for endpoints to render.

Configuration is two env vars: `DONTCODE_API_URL` and `DONTCODE_API_KEY`.
The key is server-only; the browser only ever sees its own httpOnly session
cookie. How the platform implements these services is intentionally not
visible from here — the HTTP contract (documented at
dontcode-backend/docs/public-api.md) is the entire interface.
