# Making the DontCode API fast (server-side data loaders)

ThunderLite is a BYOC app: every `db.find/findOne/count` in `src/lib/dontcode/server.ts`
is **one HTTP round-trip** to `backend.dontcode.co/api/v1/db` (~1-2s each, structured
queries only — no joins, no multi-table batching in a single call). So loader latency
is dominated by **how many round-trips you make and how many of them are serial**, not
by CPU. The `/api/maps` feed once fired ~9 sequential calls (~7s); the tactics below are
how we cut that. Apply them to any new server loader.

## 0. Where things live
- Client shim (the only thing that talks to v1): `src/lib/dontcode/server.ts` (`db`, `kv`, `realtime`)
- The loaders we optimized: `src/lib/Database/queryMaps.ts`, `src/lib/Database/getUserData.ts`
- Reference implementation of the batching idiom: `src/lib/Database/queryUsers.ts`
- Tests: `tests/Database/queryMaps.unit.test.ts` (asserts call *count*, not just output)

## 1. Kill N+1: one `in` query + compose in JS (NEVER loop a per-row fetch)
The platform has no joins, so the pattern is: fetch the parent rows, collect their ids,
fetch each related table **once** with `where: { <fk>: { in: ids } }`, then stitch in JS.
- `queryMaps` already did this for map_types / info / likes / shares.
- The leak was owners: it looped `getUserDBDataFromAuth(owner)` per map = **1 + 4 calls
  PER owner**. Replaced with `queryUsersByAuth(auths, me)` which does it in one batched wave.
- Rule of thumb: if you see `await someFetch(x)` inside a `.map`/`.reduce`/`for` over rows,
  that's an N+1 — hoist it to a single `{ in: [...] }` query.

## 2. Skip work that a logged-out viewer can't see
The public feed is mostly hit by anonymous users (`me === ''`). Per-viewer data
(following / follower / message_count / relationship) is all false/0/null with no viewer,
yet the old code still fired 4 calls per owner to compute it. `queryUsersByAuth` guards on
`me` and issues **zero** social calls when logged out. Always branch out viewer-scoped
lookups on `me`.

## 3. Collapse serial waves into one barrier
Independent queries must not `await` in sequence. Anything that depends only on the parent
rows can share a single `Promise.all`. In `queryMaps` the per-map detail lookups AND the
owner hydration both depend only on the maps rows, so they run in ONE barrier:
```ts
const [[mapTypes, infoMorphs, likes, shares], users] = await Promise.all([
    detailsPromise,                                   // map_types/info_morph/likes/shares
    queryUsersByAuth(rows.map(m => m.owner_auth), me) // owners, batched
])
```
Only genuinely dependent steps stay in a later wave (e.g. `info` needs `info_morph`'s ids).
Feed latency ≈ number of *waves*, so minimize waves, not total calls.
Gotcha: don't kick off a promise and `await` it later past a step that can throw — an
unhandled rejection results. Put co-dependent fetches in the SAME `Promise.all` so both
are awaited together.

## 4. Batch the compose, not just the fetch
After a batched fetch, index once into a `Map`/`Set` and reuse it, instead of
`.filter()`-ing the array inside the row `.map` (that's O(rows × relateds)). Build
`new Map(rows.map(r => [r.id, r]))` / `new Set(...)` up front. See `queryUsersByAuth`.

## 5. Don't 500 the whole page for one missing related row
The per-owner `getUserDBDataFromAuth` throws 400 if any profile is missing — one bad owner
kills the entire feed. The batched version just omits the missing profile. Prefer graceful
degradation in list loaders.

## 6. KV cache reference/static tables (future lever, not yet applied here)
`map_types` and `info` are effectively static reference data read on every request.
`kv` (platform cache, `src/lib/dontcode/server.ts`) can hold them with a short TTL to skip
those round-trips. NOTE: KV is **not served by the local mock** (`pnpm mock`) — a miss reads
back as `null`, so callers must degrade to a live `db` read. Only worth it once the N+1s
above are gone.

## 7. Server-side wins live upstream (the v1 gateway itself)
Per-call overhead (auth, schema lookup, usage logging, pg connection) is fixed cost in the
`dontcode-backend` repo, not here — shared pg pool, cached key/schema lookups, non-blocking
usage analytics. If a call is slow even when you've minimized round-trips, the fix is there.

## 8. Verify with call-count tests, not just output
The regression that matters is "did we quietly reintroduce an N+1?", which output assertions
miss. `tests/Database/queryMaps.unit.test.ts` mocks `db` to **record every call** and asserts:
profiles fetched exactly once; zero follows/messages/relationships when logged out; one
batched call each when logged in. Copy this harness (`vi.hoisted` shared `calls[]` + `vi.mock`
on `$lib/dontcode/server`) for new loaders. Run `pnpm check` (0 errors) + `npx vitest run`.
