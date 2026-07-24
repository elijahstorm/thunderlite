# ThunderLite — Marketing Plan & Copy Bank

**Core pitch:** Battalion: Arena, rebuilt from scratch — bigger maps, smarter AI, real multiplayer, still free.

**One-liner variants** (use whichever fits the platform's tone):
- "I rebuilt Battalion: Arena from the ground up — adaptive AI, 500x500 maps, live multiplayer, still free."
- "A love letter to Battalion: Arena / Advance Wars — turn-based tactics, live in your browser, no install."
- "The Advance Wars-style multiplayer game I always wanted, finally not laggy and not exploitable."

---

## 1. Timeline (spread over ~2 weeks so you're not answering 5 threads at once)

| Day | Action |
|---|---|
| Day 0 | Set up / polish itch.io page. This is your stable "home base" link you'll point everyone to. |
| Day 1–2 | Post to r/AdvanceWars |
| Day 3–4 | Post Show HN |
| Day 5–6 | Post to r/webgames, r/IndieGaming |
| Day 7–8 | Devlog post specifically about the adaptive AI rework (its own story, separate from launch) |
| Day 9–10 | Drop into 2–3 Advance Wars Discord servers' self-promo channels |
| Ongoing | X/Bluesky posts with clips, reply to every comment everywhere for the first 48hrs of each post |

**Golden rule:** be present and responsive in comments for the first day of each post. Engagement in the first few hours is what algorithms/upvotes reward, and it's also just the friendliest way to build a small community.

---

## 2. Reddit — r/AdvanceWars

**Title:**
> I rebuilt Battalion: Arena from scratch — adaptive AI, huge maps, live multiplayer, free in your browser

**Body:**
> A while back I played Battalion: Arena a ton and always wished it had better multiplayer reliability, less exploitable AI, and bigger maps. So I ended up rebuilding the whole thing myself.
>
> It's called ThunderLite. Free, browser-based, no install:
> https://thunderlite.vercel.app/
>
> Some of what's new/different:
> - **AI that adapts** to the situation and to your playstyle, instead of running the same predictable pattern you can learn and exploit in a few games
> - **Map sizes up to 500x500** (100x100 is the realistic sweet spot) with lots of units/buildings and no lag — the old engine capped out around 20x20
> - **Live async multiplayer** — share a code, take your turn whenever, opponent picks up when they're free
> - **ELO ranking + reviewable match history**
> - New units, a weather system, and a much more robust map editor with a proper scripting engine
> - Backed by a more reliable DB/hosting setup so games don't randomly break mid-match
>
> Still very much a solo passion project, not trying to make money off it, just want more people to enjoy it since I've had a blast building it. Would love feedback, bug reports, or just hearing what you think if you give it a shot.

---

## 3. Show HN

**Title:**
> Show HN: I rebuilt a turn-based tactics game (Advance Wars–style) to handle 500x500 maps in-browser

**Body:**
> ThunderLite is a browser-based turn-based tactics game inspired by Battalion: Arena / Advance Wars. https://thunderlite.vercel.app/
>
> I'm a solo dev and this started as "I wish this game I liked worked better," which turned into a full rebuild. A few technical bits that might be interesting to this crowd:
>
> - Engine work took map size limits from ~20x20 (original) to a realistic 100x100 and a tested ceiling of 500x500, fully populated with units/buildings, without meaningful lag
> - Rebuilt the CPU opponent to adapt to game state and to the human player's patterns over the course of a match, instead of running a fixed decision tree that becomes trivially exploitable after a few games
> - Multiplayer is async (share a code, take turns whenever) and backed by a more reliable DB/storage layer than my original setup — ran load and soak testing before calling it stable
> - Built-in map editor with a scripting engine for custom maps/scenarios
> - ELO + full match history for competitive play
>
> No monetization, just a project I wanted to exist. Happy to talk through any of the engine/AI/infra decisions in comments.

---

## 4. r/webgames

**Title:**
> [Free] ThunderLite — turn-based tactics in your browser, Advance Wars-inspired, live multiplayer

**Body:**
> Free browser game, no install, no signup required to try single player. Turn-based tactics in the Battalion: Arena / Advance Wars mold — build units, capture territory, outmaneuver the enemy.
>
> https://thunderlite.vercel.app/
>
> - Live multiplayer via shareable room codes (async — take your turn whenever)
> - Built-in map editor, browse community maps
> - ELO + match history
> - CPU opponent that adapts instead of being easily exploitable
>
> Made this solo as a passion project. Would love for more people to give it a shot.

---

## 5. Devlog post — the AI rework (separate post, ~1 week after launch)

**Title:**
> I got tired of AI you could "solve" in 3 games, so I rewrote it to actually adapt

**Body:**
> One of the biggest complaints with the original game this is inspired by (and honestly most tactics-game AI in general) is that the CPU runs a fixed pattern. Play it a few times, learn the pattern, and every game after that is just execution, not a real fight.
>
> So for ThunderLite I rebuilt the AI to react to both the current battlefield state and to how the specific opponent has been playing — meaning it takes noticeably longer before you can "solve" it, and different playstyles get different responses back.
>
> It's live now if anyone wants to poke at it and see if you can find the seams: https://thunderlite.vercel.app/
>
> Curious if anyone here has done similar adaptive-AI work for turn-based games — happy to compare notes.

---

## 6. itch.io page copy

**Short description (for the game card):**
> Free browser-based turn-based tactics — Advance Wars-inspired, live multiplayer, huge maps, adaptive AI. No install.

**Full description:**
> ThunderLite is a love letter to Battalion: Arena and the Advance Wars family of turn-based tactics games — rebuilt from the ground up to fix everything that used to be frustrating.
>
> **What's in it:**
> - Live, async multiplayer — share a room code, take your turn whenever
> - Map sizes up to 500x500 (100x100 recommended), fully populated with units and buildings, no lag
> - CPU opponent that adapts to the situation and to your playstyle, so it stays a real challenge for longer
> - Built-in map editor with a scripting engine — build and share your own maps
> - New units and a weather system that affects strategy
> - ELO ranking and full match history
>
> Free to play, no download, playable straight in your browser. Built solo as a passion project — feedback and bug reports always welcome.

**Tags to use:** turn-based, tactics, strategy, multiplayer, browser, free, advance-wars-like, wargame

---

## 7. X / Bluesky short posts (pair each with a clip or gif)

1. > Rebuilt an Advance Wars-style tactics game from scratch — adaptive AI, maps up to 500x500, live multiplayer, still free. thunderlite.vercel.app

2. > The old AI in games like this gets "solved" after 3-4 matches. Spent a while making mine actually adapt to your playstyle instead. Free to try: thunderlite.vercel.app

3. > No install, no signup needed to try it — turn-based tactics, live in your browser. thunderlite.vercel.app

---

## 8. Discord self-promo blurb (short, casual)

> Made a free browser-based turn-based tactics game inspired by Battalion: Arena / Advance Wars — live multiplayer via room codes, adaptive AI, map editor, up to 500x500 maps. No install: https://thunderlite.vercel.app/ — solo project, would love feedback!

---

## 9. Screenshot / clip shot list (for you to capture)

Since I can't load and screenshot the live app myself, here's exactly what's worth capturing, roughly in priority order:

1. **A mid-battle overview shot** on a mid-size map — this is your hero image, use it everywhere (Reddit, itch.io, Show HN, embedded card).
2. **A 10–15 second clip of a turn playing out** — movement, an attack, maybe a capture. This will outperform any static screenshot for engagement.
3. **The map editor in action** — painting terrain or placing units, shows off the scripting/robustness.
4. **A weather effect visibly changing the board** (rain/fog/whatever you built) — good for a "did you know" style post later.
5. **The ELO/match history screen** — signals "this is a real competitive platform," good for the devlog or a comment reply when someone asks "is there ranked."
6. **A large map (100x100+) zoomed out** to visually sell the scale claim — this one's worth its own post/tweet on its own ("here's a 300x300 map running smooth").

If you grab a batch of these and upload them to me, I can help you crop/order them for each platform's format and write alt-text/captions.

---

## 10. Landing page suggestions

The current homepage is clean and the pitch is already solid ("love letter to Battalion: Arena," free/no-download/live-multiplayer badges). A few things that would help conversion once traffic starts coming from Reddit/HN/etc.:

1. **Put your new features on the homepage, not just in your head.** Right now the homepage sells the *original* pitch (turn-based tactics, live multiplayer, map editor) but doesn't mention adaptive AI, ELO, match history, weather, or the 500x500 map scale — which are your actual differentiators and the stuff that'll get people to click through from a Reddit post. Consider a "What's new" or "Why ThunderLite" section that explicitly lists: adaptive AI, ELO + match history, huge maps, weather system, reliable multiplayer.

2. **Add a short gameplay clip/gif above the fold**, not just the one static screenshot. Turn-based tactics is hard to sell as a still image — motion sells the genre.

3. **Show scale as a stat, not just a feature.** Something like "Maps up to 500×500" as a small stat/badge next to "Free to play / No download / Live multiplayer" would be a strong, skimmable hook for people who scroll fast.

4. **A visible "no signup required to try single player" callout** (if that's accurate) lowers friction a lot for cold Reddit/HN traffic — people bounce fast if they think they need to make an account before seeing anything.

5. **An /about page link to your dev story** (you already have one) — worth expanding it slightly to mention *why* you rebuilt it (the AI exploitability problem, the old map-size limits, multiplayer reliability). That story is genuinely compelling and doubles as content you can link to instead of retyping it in every comment thread.

6. **Open Graph image** — you already have `embedded-card.png` set for social previews, which is good. Just make sure it reflects current visuals/features since that's the first thing people see when your Reddit/X links unfurl.

7. **A lightweight "Report a bug / feedback" link** somewhere visible — when you post to HN/Reddit you'll get a wave of first-time players; an easy feedback channel turns bug reports into goodwill instead of into unanswered comments scattered across five platforms.
