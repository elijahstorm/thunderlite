---
id: K4
epic: K - Single-player campaign
title: Single-player mode shell — title entry, level select, continue/auto-advance
depends_on: [K3, J2]
---

# K4 — Single-player mode shell

## Why this card exists

The pieces exist (runner K2, progression K3) but there's no way in. The user wants: a **Single Player** entry on the title screen, **distinct from the multiplayer entry** → start at level 1 → beat it → next level unlocks and the game **auto-advances** to it, with a **Continue** button. This card is the navigation shell that ties campaign play together.

Single-player and multiplayer are **separate paths**. Today the landing page ([`LandingPage.svelte`](../src/lib/Components/PageContainers/LandingPage.svelte)) is multiplayer-first: the "Get started" CTA routes to `/play` (a live session) and the rooms hub lives at `/rooms`. Single-player must be its own link/CTA next to those, routing to `/campaign` — not folded into the multiplayer "Play" button.

## Scope

- **Title-screen entry:** add a distinct **Single Player** (campaign) CTA to the landing page ([`LandingPage.svelte`](../src/lib/Components/PageContainers/LandingPage.svelte)), shown alongside — not merged with — the existing multiplayer "Get started" → `/play` CTA. It routes to `/campaign`. The two modes read as two clearly separate choices.
- **Campaign route** `src/routes/(app)/campaign/+page.svelte`: a level select listing levels from the K3 registry with locked/unlocked state. The first time in (no progress), the user lands ready to **Start** level 1.
- **Launch flow:** selecting an unlocked level loads its map + script and starts a campaign match (`mode: 'campaign'`, `campaignLevelId` set), mounting the K2 runner.
- **Win flow:** on a campaign win the J2 stats screen shows **Continue**. Because K3 already unlocked the next level off the J1 hook, **Continue** routes straight into the next level (auto-advance). If it was the last level, Continue returns to the campaign screen with a "campaign complete" state.
- **Lose flow:** stats screen offers **Retry** (reload same level) and **Exit to campaign**.

## Acceptance criteria

- [ ] Landing page shows a **Single Player** entry distinct from the multiplayer "Get started"/`/play` entry; the two modes are visually separate choices.
- [ ] The Single Player entry opens `/campaign`; first visit starts at level 1; locked levels can't be launched.
- [ ] Beating a level shows **Continue**, which loads the next level directly.
- [ ] Beating the final level shows a campaign-complete state instead of advancing.
- [ ] Losing offers **Retry** and **Exit**; retry reloads the same level cleanly.
- [ ] Playwright smoke: launch campaign, force-win level 1 (test hook), assert auto-advance to level 2.

## Files likely to change

- `src/lib/Components/PageContainers/LandingPage.svelte` (add the Single Player CTA, separate from the multiplayer one)
- `src/routes/(app)/campaign/+page.svelte` (new — level select + complete state)
- `src/routes/(app)/campaign/[levelId]/+page.svelte` (new — hosts the campaign match)
- `src/lib/Engine/HUD/StatsScreen.svelte` (wire Continue/Retry destinations — fulfils the K4 TODO left in J2)
- `tests/e2e/campaign.e2e.test.ts`

## Out of scope

- Level content (K5).
- Difficulty paths (easy/med/hard) — the old "updates" page floated these; defer.

## Notes for the coder

- Auto-advance should feel seamless: Continue goes to the next level's host route, it doesn't bounce through the level-select grid.
- Keep a test-only "force win" hook so the Playwright flow can verify auto-advance without playing a full match.
