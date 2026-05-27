---
id: I3
epic: I - Audio
title: Action SFX and environmental weather audio
depends_on: [I1, B1, F3]
---

# I3 — Action SFX and environmental weather audio

## Why this card exists

The bank has weapon SFX (`sfx/attack/{big gun,light gun,machine gun,distance}`), per-locomotion movement SFX (`sfx/movement/{footstep,car move,jet,boat,...}`), plus `build` and `explosion`, and looping weather ambiences (`envior/weather/{rain,snow,desert,sunny}`). The original game mapped a sound to each unit's weapon, each movement type, and each active weather. None are wired in the new engine.

## Scope

- `src/lib/Audio/sfxMap.ts`: pure `sfxForAction(action, unit) → sfxId | null` mapping the unit's weapon/attack profile → attack SFX, movement type → movement SFX, plus `build` on spawn and `explosion` on death.
- Fire SFX from the action-resolution layer ([`applyAction.ts`](../src/lib/Engine/applyAction.ts) / [`interactor.ts`](../src/lib/Engine/Interactor/interactor.ts)): move → movement SFX, attack → weapon SFX, death → explosion, build/spawn → build.
- `src/lib/Audio/weatherAudio.ts`: when F3 weather is active, loop the matching `env` track; stop on clear. Duck `env` volume so weather sits under music.

## Acceptance criteria

- [ ] Moving a Strike Commando plays `footstep`; a tank plays `car move`; a jet plays `jet`.
- [ ] Attacking plays the weapon-appropriate gun SFX; a kill plays `explosion`.
- [ ] Activating rain weather loops `envior/weather/rain`; clearing it stops the loop.
- [ ] All SFX respect the `sfx` channel mute/volume from I1.
- [ ] Vitest: `sfxForAction` covers move / attack / build / death branches.

## Files likely to change

- `src/lib/Audio/sfxMap.ts` (new)
- `src/lib/Audio/weatherAudio.ts` (new)
- `src/lib/Engine/applyAction.ts` or `src/lib/Engine/Interactor/interactor.ts` (fire SFX on resolved actions)
- `tests/Audio/sfxMap.unit.test.ts`

## Out of scope

- Per-unit unique voice lines.
- Positional / stereo panning.

## Notes for the coder

- Fire SFX only for **live** actions, not for replayed ones. H3 replays the full event log on reconnect — that path must stay silent, or a reconnecting player hears 40 explosions at once. Gate SFX on a "live vs replay" flag passed through the apply path.
- Map by the unit's weapon/attack-type field, not by unit name, so new units inherit sounds for free.
