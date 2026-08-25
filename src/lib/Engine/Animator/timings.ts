/**
 * Animation beats, in their own leaf module.
 *
 * These live apart from `animator.ts` because callers that need to know how LONG
 * something will take are not always callers that can afford to import the
 * animator. `animator.ts` pulls in svelte stores, the pathfinder, the sprite
 * renderer and the GameData tables; the socket event queue needs to reason about
 * a backlog's playback time and runs in contexts (and tests) where none of that
 * should be loaded.
 *
 * `animator.ts` re-exports every one of these, so existing imports are unchanged
 * and there is exactly one definition of each number.
 */

/** One tile of movement, and the beat the sprite/idle clocks run on. */
export const ANIMATION_TIME = 200

// Health bars don't snap to their new value after a hit — they glide there with an
// ease-out so a chunk of damage (or a heal) reads as motion. ~400ms is long enough
// to register the slide without holding up the next combat beat.
export const HEALTH_BAR_ANIMATION_TIME = 400

// Grace on top of the ease before the wall-clock backstop finishes it by hand
// (see `animateHealthBar`). Generous enough that a visible tab always lands the
// real animation first, short enough that a hidden one isn't held up long.
export const HEALTH_BAR_BACKSTOP_SLACK = 600

// Per-frame playback for combat overlays (attack swings, explosions). These
// sprite sheets run 8-14 frames; at the 200ms movement beat they dragged on for
// 1.6-2.8s and read as unnaturally slow. ~55ms (~18fps) keeps them punchy while
// still showing every frame. Tuned independently of movement/idle pacing.
export const OVERLAY_ANIMATION_TIME = 55
