# ThunderLite — Work cards

Each numbered `.md` file is one work card. Read [`00-PROJECT-MISSION.md`](./00-PROJECT-MISSION.md) first.

## Ordering

The cards run sequentially through the orchestrator. The order encodes dependencies:

- **A1 → A2 → A3** — turn loop, end-turn, modifier dispatcher (foundation)
- **B1 → B2 → B3** — damage formula, counter rules, terrain damage
- **C1 → C2 → C3 → C4** — treasury, capture, build menu, Warmachine
- **D1 → D2** — win conditions and game-over screen
- **E1 → E2 → E3** — HUD shell, action menu, editor play button
- **F1 → F2 → F3** — fog of war, cloak/stealth/jammer, weather (exploratory)
- **G1 → G2 → G3 → G4** — Vulture, Lance, transports, repair
- **H1 → H2 → H3** — second-player join, move relay, replay
- **I1 → I2 → I3** — audio engine, music director, SFX + weather audio
- **J1 → J2 → J3** — match-end hook, end-game stats screen, result persistence + profile stats
- **K1 → K2 → K3 → K4 → K5** — cutscene DSL, campaign runner, progression/unlocks, single-player mode shell, 10 authored levels

After D, the smallest playable end-to-end game exists. E–G add depth. H makes it online. I adds sound from the existing asset bank. J introduces a single match-end hook that stats, persistence, campaign unlocks, and future PvP elo all subscribe to. K is the single-player campaign and depends on J1's hook for level unlocks.
