# Header / Navigation Audit

Date: 2026-08-25

## What triggered this

`/users/<auth>` (e.g. `https://thunderlite.vercel.app/users/a987e813-...`) rendered a bare
profile card with no site header. Once a visitor landed there (from a roster, a match
result, a chat avatar) the only way out was the browser back button.

## Fixes applied

### 1. `/users/[userAuth]` — header, footer, and the chat dock

The route moved from `src/routes/users/` into the `(app)` group, so it is now
[src/routes/(app)/users/[userAuth]/](src/routes/(app)/users/[userAuth]/). The public URL is
unchanged. That buys the profile the docked chat list and the "Made with DontCode" badge that
every other signed-in page has.

The page body now uses the same shell every other content page uses:

```svelte
<ContentWithFooter>
  <Header />
  <section class="mx-auto w-full max-w-3xl px-4 py-8 space-y-6"> ... </section>
</ContentWithFooter>
```

The hand-rolled `PoweredByDontCode variant="footer"` strip at the bottom of the page was
removed, because `ContentWithFooter` already renders it inside the real footer.

The **Message** button changed behaviour: it used to `goto('/chat/<auth>')`, and now sets
`openDmWith`, popping the conversation open in the dock without leaving the profile. The
`(app)` layout was already written for this — its comment names "profile" as an expected
caller — it just could not reach the store from outside the group. Revert `const message` in
the page if you would rather keep the full-page navigation.

### 2. `/chat/[auth]` — header over a genuinely flexible transcript

The page now renders `<Header />` above the conversation. It deliberately does **not** use
`ContentWithFooter`: a full site footer under a full-height chat would push the composer
behind a page scroll. It keeps the small inline `PoweredByDontCode` strip instead.

Making room for the header meant the transcript had to stop being a fixed height.
`ChatRoom` gained a `fill` prop: the docked panel keeps its pinned
`h-[calc(21.25rem-1px)]` transcript, while `fill` swaps that for `flex-1 min-h-0` so the
standalone page's transcript takes whatever height is left under the header and scrolls
inside itself. The page carries `min-h-0` down every link of the flex chain for the same
reason.

This page stays outside `(app)` on purpose, so it does not get the chat dock — it *is* a
chat.

`svelte-check`, Prettier, and `npm run build` all pass on the changed files.

## How the shell is wired today

There is no single global header. Two containers provide it:

| Container | Provides |
| --- | --- |
| `Casing.svelte` | `<Header />` + a `container` wrapper |
| `ContentWithFooter.svelte` | full-height flex column + site footer (no header of its own) |

`(dashboard)` and `(marketing)` get the header from their group layout. Everything under
`(app)` imports `Header` + `ContentWithFooter` **per page**, because the group layout only
mounts the chat dock. That per-page opt-in is exactly why a new route can silently ship
without a header, which is what happened here.

## Full route sweep

### Missing the header, worth changing — both now fixed

| Route | Notes |
| --- | --- |
| `/users/[userAuth]` | **Fixed.** Header, footer, chat dock. |
| `/chat/[auth]` | **Fixed.** Header plus a flexible transcript; no chat dock by design. |

### Missing the header, deliberately

| Route | Why it is fine |
| --- | --- |
| `/play` | In-match. Excluded by request. |
| `/campaign/[levelId]` | In-match; HUD owns the screen. |
| `/replays/[matchId]` | `h-screen` viewer; `ReplayViewer` renders a menu link (`menuHref`, defaults to `/my/games`). Self-contained player UI, same rationale as `/play`. |
| `/login`, `/logout` | `HalfPageInfoAndGraphic` shows a home-linked logo on desktop (aside) and a dedicated mobile header bar. Focused auth flow, intentionally nav-free. |
| `/dev/*` (17 pages) | Internal harnesses. |

### Confirmed OK

- `/` — `ContentWithFooter` + `Header`
- `(marketing)`: `/about`, `/download`, `/privacy` — group layout `Casing`
- `(dashboard)`: `/me`, `/my/*` — group layout `Casing` + sidebar
- `/onboarding` — own layout and `+page@.svelte` both carry `ContentWithFooter` + `Header`
- `(app)`: `/campaign`, `/make`, `/map/[id]`, `/rooms`, `/rooms/[session]`, `/editor`, `/editor/[id]`
- `+error.svelte` — `Casing`

## Collision warning

A parallel session is mid-way through **removing the follow / unfollow feature**: it has
deleted `api/user/[userAuth]/follow`, `api/user/[userAuth]/unfollow`,
`api/users/followers`, and `api/users/following`, and dropped `queryFollowers` /
`queryFollowing` from `queryUsers.ts`. `svelte-check` currently reports six errors in
`tests/Database/queryMaps.unit.test.ts` from that in-flight work — none of them from this
pass.

That matters here because the profile page still renders a **Follow** button that POSTs to
the now-deleted `/api/user/<auth>/follow` and `/unfollow`, and reads `user.following`. That
session and this one have both touched
[src/routes/(app)/users/[userAuth]/+page.svelte](src/routes/(app)/users/[userAuth]/+page.svelte),
and the file has additionally *moved* — worth reconciling before either lands.

## Suggested follow-up

The per-page `Header` import inside `(app)` is the root cause. Either move `Header` into
`(app)/+layout.svelte` and have the three full-screen routes (`/play`, `/campaign/[levelId]`,
`/replays/[matchId]`) opt out, or add a lint/test that asserts every non-game `+page.svelte`
reaches a `Header`. Without one of those, the next content route will ship headerless too.
