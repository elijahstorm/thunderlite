---
id: I1
epic: I - Audio
title: Audio playback engine (channels, volume, mute, asset manifest)
depends_on: []
---

# I1 — Audio playback engine

## Why this card exists

`static/game/sounds/` ships a full audio bank — music (`music/game/{intro,player,enemy,ally,thinking,inactive,win,lose}`), attack/movement SFX (`sfx/attack/*`, `sfx/movement/*`, `sfx/{build,explosion,empty}`), and weather loops (`envior/weather/{rain,snow,desert,sunny}`). Nothing in `src` plays any of it. The original game had a mood-aware audio system; this card builds the playback foundation the rest of epic I sits on.

## Scope

- `src/lib/Audio/audioEngine.ts` with three independent channels: `music`, `sfx`, `env`. Each has its own volume + mute; plus a master volume + mute.
- `music` and `env` are single-active looping channels (starting a new track stops the current one cleanly). `sfx` is pooled and fire-and-forget so the same effect can overlap.
- Format negotiation: prefer `.ogg`, fall back to `.mp3` via `canPlayType`. Lazy-load and cache decoded elements.
- Settings persistence: channel volumes + mutes saved to `localStorage`, restored on init.
- SSR-safe: never construct `Audio` during SSR; guard all browser APIs behind SvelteKit's `browser` flag.

## Acceptance criteria

- [ ] `playMusic('game/player')` loops; `playMusic('game/enemy')` swaps with no overlap.
- [ ] `playSfx('explosion')` fired three times in quick succession overlaps rather than restarting one element.
- [ ] Muting the `music` channel silences music while `sfx` keeps playing.
- [ ] Volume + mute survive a page reload.
- [ ] Vitest: the channel state machine (active track per channel, mute/volume flags) is pure and testable without real audio playback.

## Files likely to change

- `src/lib/Audio/audioEngine.ts` (new)
- `src/lib/Audio/assetManifest.ts` (new — logical name → file path map)
- `src/lib/Stores/audioSettings.ts` (new)
- `tests/Audio/audioEngine.unit.test.ts`

## Out of scope

- Wiring audio to game events (I2 music, I3 SFX/weather).
- Settings UI beyond the persisted store (folded into `/my/settings` later).

## Notes for the coder

- A pooled `HTMLAudioElement` approach is fine. Don't pull in Howler unless format fallback or pooling gets genuinely painful.
- Keep "which track is active per channel" in a plain object so the state machine is unit-testable headless, the same way the engine modules are.
