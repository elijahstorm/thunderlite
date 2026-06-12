# DontCode platform boundary

Everything ThunderLite knows about the DontCode platform lives in this
directory — nothing elsewhere in the app talks to the platform directly.
This is deliberate: these files are the working prototype of the upcoming
`@dontcode/backend` SDK (name pending), and when that package ships, the
migration is `import from '@dontcode/backend/*'` instead of `$lib/dontcode/*`
with no other app changes.

| File         | Future SDK entry point               | Surface                                                    |
| ------------ | ------------------------------------ | ---------------------------------------------------------- |
| `server.ts`  | `@dontcode/backend/server`           | `db` (structured queries), `auth`, `storage`, `migrate`    |
| `client.ts`  | `@dontcode/backend/client`           | `loggedIn` / `userAuth` stores, `refreshSession`, `logout` |
| `cookies.ts` | `@dontcode/backend/sveltekit` (glue) | `access_token` cookie helpers for SvelteKit endpoints      |

Configuration is two env vars: `DONTCODE_API_URL` and `DONTCODE_API_KEY`.
The key is server-only; the browser only ever sees its own httpOnly session
cookie. How the platform implements these services is intentionally not
visible from here — the HTTP contract (documented at
dontcode-backend/docs/public-api.md) is the entire interface.
