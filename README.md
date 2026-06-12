# ThunderLite

A browser-based recreation of **Battalion: Arena** (Urban Squall) — a turn-based tactics game in the Advance Wars family. Built with SvelteKit, deployed on Vercel, and running on the **DontCode developer platform**: auth, database, and file storage are DontCode services reached over HTTP with a project API key — no local auth stack, no Postgres connection string, no storage credentials.

See [cards/00-PROJECT-MISSION.md](cards/00-PROJECT-MISSION.md) for the full design north star.

## Quickstart

Docker is the canonical dev environment — you don't need Node or pnpm on the host.

```bash
cp .env.example .env.local        # fill in DONTCODE_API_URL / DONTCODE_API_KEY + cloud vars (see below)
docker compose up                 # builds and starts app + redis + kv shim + chat
```

Open [http://localhost:15173](http://localhost:15173).

| Service                                                                              | URL / endpoint                                                       | Purpose                                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `app`                                                                                | [http://localhost:15173](http://localhost:15173)                     | SvelteKit dev server, HMR enabled                                                                 |
| `kv` ([hiett/serverless-redis-http](https://github.com/hiett/serverless-redis-http)) | [http://localhost:180](http://localhost:180) (token `example_token`) | Upstash-compatible REST shim in front of Redis — what `@vercel/kv` talks to                       |
| `redis`                                                                              | network-only                                                         | Backing store for the kv shim                                                                     |
| `chat`                                                                               | `ws://localhost:18083/ws`                                            | In-game chat WebSocket broadcaster — script at [scripts/chat-server.mjs](scripts/chat-server.mjs) |

Auth, database, and file storage have **no local containers** — the app talks to the DontCode backend named by `DONTCODE_API_URL`, in dev and in prod alike. Only ephemeral pieces (KV game-session state, the chat broadcaster) run locally.

All host-side ports bind to `127.0.0.1` only. The `app` service mounts the working tree at `/app`, so file edits hot-reload in place. `node_modules` lives in a named volume inside the container so host changes don't shadow it.

### Port conflicts

All thunderlite host ports prepend a `1` to the standard port (e.g. `5173` → `15173`). Override any host-side port if it's still in use:

```bash
APP_HOST_PORT=15174 KV_HOST_PORT=181 CHAT_HOST_PORT=18084 docker compose up
```

### Rebuilds

Re-run `docker compose build app` after changes to `package.json` or the lockfile. Other source changes pick up automatically through the bind mount.

### Tearing down

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # nuke redisdata + cached node_modules
```

## Dev playground — animations & sounds

[/dev](src/routes/dev/+page.svelte) is a sandbox for testing game animations and audio without starting a match. It is dev-server only (404s in production builds). Open [http://localhost:15173/dev](http://localhost:15173/dev) (Docker) or `http://localhost:5173/dev` (`pnpm dev`).

- **Units** — every unit's idle animation with team-color and facing selectors, plus per-unit Attack (overlay animation + its mapped weapon sfx), Move sfx, and Die (explosion animation + sfx) buttons. Rendering uses the same sprite loader, colorizer, and frame math as the in-game `Animator`, so what you see is what the game draws.
- **Tile FX** — the explosion / pointer / select sheet animations looping.
- **Sounds** — channel mixer (master/music/sfx/env volumes + mutes, persisted like in-game settings), a button per sound effect, the adaptive music stem layer with per-stem solo + crossfade control, win/lose stings, and weather ambience loops.

If nothing sounds, click anywhere on the page once — browsers block audio until a user gesture.

## Environment variables

`docker-compose.yml` overrides the in-network ones (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `NODE_ENV`) automatically — leave them blank in `.env.local`.

| Variable                   | Where it's used                                                                            | Notes                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `DONTCODE_API_URL`         | [src/lib/Server/dontcode.ts](src/lib/Server/dontcode.ts) — auth, database, storage         | **Required.** Base URL of the DontCode backend.                                |
| `DONTCODE_API_KEY`         | [src/lib/Server/dontcode.ts](src/lib/Server/dontcode.ts)                                   | **Required.** This project's API key (`dc_…`), minted in the DontCode console. |
| `EDGE_CONFIG`              | [src/routes/+layout.server.ts](src/routes/+layout.server.ts) — loads site title/desc/fonts | **Required for `/` to render.** Empty → home page returns 500.                 |
| `PUBLIC_SOCKET_CONNECTION` | [src/lib/Components/Socket/ChatSocket.svelte](src/lib/Components/Socket/ChatSocket.svelte) | WebSocket endpoint for chat/multiplayer                                        |
| `VITE_EMAIL_NAME`          | [src/routes/api/contact/mailCarrier.ts](src/routes/api/contact/mailCarrier.ts)             | Sender address for the contact form                                            |

### First-run schema setup

The app's tables live in the project's DontCode database. After pointing a fresh project at the app, apply the schema once (dev only):

```bash
curl http://localhost:15173/api/migrations/up
```

> **Vercel Marketplace note** — Vercel KV is no longer a first-party product. Provision **Upstash Redis** through the Vercel Marketplace; the same env-var names (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are auto-populated.

## Running without Docker

If you'd rather run on the host directly:

- Node.js 24+ and pnpm 10+
- `pnpm install`
- Provide every variable from `.env.example` plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` in `.env.local`
- `pnpm dev`

## Scripts

| Command                 | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `pnpm dev`              | Vite dev server on port 5173                         |
| `pnpm build`            | Production build via the Vercel adapter              |
| `pnpm preview`          | Serve the built output on port 4173                  |
| `pnpm check`            | `svelte-kit sync` + `svelte-check`                   |
| `pnpm check:watch`      | Same, in watch mode                                  |
| `pnpm lint`             | Prettier check + ESLint                              |
| `pnpm format`           | Prettier write                                       |
| `pnpm test`             | Playwright integration tests, then Vitest unit tests |
| `pnpm test:unit`        | Vitest only (`tests/**/*unit.(test\|spec).ts`)       |
| `pnpm test:integration` | Playwright only                                      |

Run any script inside the Docker stack with `docker compose exec app pnpm <script>`.

## Production preview image

[Dockerfile](Dockerfile) builds the production bundle and runs `pnpm preview` on 4173:

```bash
docker build -t thunderlite .
docker run --rm -p 4173:4173 --env-file .env.local thunderlite
```

## Project layout

```
src/
  routes/            # SvelteKit routes
    (app)/           # play, editor, make, rooms (auth-gated)
    (auth)/          # login, logout (DontCode auth)
    (marketing)/     # about, contact, privacy, support, …
    api/             # game, user, upload, migrations, auth endpoints
  lib/
    Engine/          # turn loop, combat, modifiers, win conditions
    Map/             # tile renderer, editor, exporter
    Server/          # DontCode platform client (auth, db, storage)
    Components/      # Auth, Socket, HUD, widgets
cards/               # design + implementation briefs the orchestrator works through
scripts/             # orchestrator runner (see scripts/README.md)
static/game/play/    # sprite sheets, terrain, building, weather assets
```

## Orchestrator

The `cards/` directory drives a Claude-powered build orchestrator that implements features one card at a time. Operating it is separate from running the app — see [scripts/README.md](scripts/README.md).
