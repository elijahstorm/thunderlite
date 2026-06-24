import { writable } from 'svelte/store'
import type { OcclusionMode } from './lineOfSight'

// Which fog-of-war line-of-sight model is active. 'off' is the shipped behaviour
// (a plain Manhattan-diamond sight radius with no terrain occlusion). The two
// height-aware models are under live evaluation on the /dev/los playground, so the
// default stays 'off' and normal play is unchanged until a model is chosen.
export const occlusionMode = writable<OcclusionMode>('off')

// Whether high terrain casts indirect-fire shadows (idea #4): a long-range unit
// can't hit a target tucked behind/below taller ground between them. This is a
// decided gameplay rule so it defaults ON, but it's exposed as a toggle so the
// playground can show the board with and without it.
export const indirectShadowsEnabled = writable<boolean>(true)
