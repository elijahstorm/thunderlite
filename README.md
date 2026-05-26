# ThunderLite

A browser-based recreation of **Battalion: Arena** (Urban Squall) — a turn-based tactics game in the Advance Wars family. Built with SvelteKit and deployed on Vercel.

See [cards/00-PROJECT-MISSION.md](cards/00-PROJECT-MISSION.md) for the full design north star.

## Quickstart

Docker is the canonical dev environment — you don't need Node or pnpm on the host.

```bash
cp .env.example .env.local        # fill in the cloud-only vars (see below)
docker compose up                 # builds and starts app + db + redis + kv shim
```

Open http://localhost:5173.

| Service                                                                              | URL / endpoint                                 | Purpose                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------- |
| `app`                                                                                | http://localhost:5173                          | SvelteKit dev server, HMR enabled                                           |
| `db` (Postgres 16)                                                                   | `localhost:55432` (user/pass/db `thunderlite`) | App data + Hanko's `hanko` database                                         |
| `kv` ([hiett/serverless-redis-http](https://github.com/hiett/serverless-redis-http)) | http://localhost:58079 (token `example_token`) | Upstash-compatible REST shim in front of Redis — what `@vercel/kv` talks to |
| `redis`                                                                              | network-only                                   | Backing store for the kv shim                                               |
| `hanko` ([ghcr.io/teamhanko/hanko](https://github.com/teamhanko/hanko))              | http://localhost:8000                          | Auth backend; config in [hanko/config.yaml](hanko/config.yaml)              |
| `mailpit` ([axllent/mailpit](https://github.com/axllent/mailpit))                    | http://localhost:8025                          | Inbox for every email Hanko sends — open the UI to read passcodes           |
| `chat`                                                                               | ws://localhost:8083/ws                         | In-game chat WebSocket broadcaster — script at [scripts/chat-server.mjs](scripts/chat-server.mjs) |

All host-side ports bind to `127.0.0.1` only. The `app` service mounts the working tree at `/app`, so file edits hot-reload in place. `node_modules` lives in a named volume inside the container so host changes don't shadow it.

### Port conflicts

The app defaults to 5173 (the Vite convention). Override any host-side port if it's already in use:

```bash
APP_HOST_PORT=5174 POSTGRES_HOST_PORT=55433 KV_HOST_PORT=58080 HANKO_HOST_PORT=8001 MAIL_HOST_PORT=8026 CHAT_HOST_PORT=8084 docker compose up
```

If you change `HANKO_HOST_PORT`, update `PUBLIC_HANKO_API_URL` in `.env.local` and the `cors.allow_origins` / `webauthn.relying_party.origins` lists in [hanko/config.yaml](hanko/config.yaml) to match.

### Rebuilds

Re-run `docker compose build app` after changes to `package.json` or the lockfile. Other source changes pick up automatically through the bind mount.

### Tearing down

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # nuke pgdata + redisdata + cached node_modules
```

## Environment variables

`docker-compose.yml` overrides the in-network ones (`POSTGRES_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `NODE_ENV`) automatically — leave them blank in `.env.local`. `PUBLIC_HANKO_API_URL` defaults to the in-stack Hanko container.

The remaining variables are cloud-only services with no local mock. Pull them from your Vercel project (`pnpm dlx vercel env pull .env.local`) or provision your own:

| Variable                   | Where it's used                                                                            | Notes                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `EDGE_CONFIG`              | [src/routes/+layout.server.ts](src/routes/+layout.server.ts) — loads site title/desc/fonts | **Required for `/` to render.** Empty → home page returns 500.                     |
| `BLOB_READ_WRITE_TOKEN`    | Map / asset upload routes                                                                  | Required for upload features                                                       |
| `PUBLIC_HANKO_API_URL`     | [src/lib/Components/Auth/](src/lib/Components/Auth/) — JWT verification & login UI         | Defaults to `http://localhost:8000` (in-stack Hanko). Set to Hanko Cloud URL to use cloud. |
| `PUBLIC_SOCKET_CONNECTION` | [src/lib/Components/Socket/ChatSocket.svelte](src/lib/Components/Socket/ChatSocket.svelte) | WebSocket endpoint for chat/multiplayer                                            |
| `VITE_EMAIL_NAME`          | [src/routes/api/contact/mailCarrier.ts](src/routes/api/contact/mailCarrier.ts)             | Sender address for the contact form                                                |

### Hanko dev config

The self-hosted Hanko backend is configured for friction-free dev: **email/password sign-up**, email verification + password recovery emails routed to **mailpit** (no real SMTP), passkeys disabled, MFA disabled. Config lives in [hanko/config.yaml](hanko/config.yaml). The Hanko database (`hanko`) sits alongside `thunderlite` in the same Postgres container; `hanko-init` creates it idempotently and `hanko-migrate` applies the schema before the server starts.

To read a verification passcode or password-reset email, open the mailpit UI at http://localhost:8025.

If you change the Hanko config, restart with `docker compose up -d --force-recreate hanko-migrate hanko`. To rebuild from scratch (drops users + sessions): `docker compose down -v` then `docker compose up`.

> **Vercel Marketplace note** — Vercel Postgres and Vercel KV are no longer first-party products. Provision **Neon Postgres** and **Upstash Redis** through the Vercel Marketplace; the same env-var names (`POSTGRES_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`) are auto-populated.

## Running without Docker

If you'd rather run on the host directly:

- Node.js 24+ and pnpm 10+
- `pnpm install`
- Provide every variable from `.env.example` plus `POSTGRES_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` in `.env.local`
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
    (auth)/          # login, logout (Hanko)
    (marketing)/     # about, contact, privacy, support, …
    api/             # game, user, upload, migrations endpoints
  lib/
    Engine/          # turn loop, combat, modifiers, win conditions
    Map/             # tile renderer, editor, exporter
    Components/      # Auth (Hanko), Socket, HUD, widgets
cards/               # design + implementation briefs the orchestrator works through
hanko/               # self-hosted Hanko backend config (config.yaml)
scripts/             # orchestrator runner (see scripts/README.md)
static/game/play/    # sprite sheets, terrain, building, weather assets
```

## Orchestrator

The `cards/` directory drives a Claude-powered build orchestrator that implements features one card at a time. Operating it is separate from running the app — see [scripts/README.md](scripts/README.md).
