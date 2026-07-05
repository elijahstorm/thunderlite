import { writable } from 'svelte/store'
import type { OcclusionMode } from './lineOfSight'

// Which fog-of-war line-of-sight model is active. Height-aware 'viewer-relative'
// tiers are the shipped rule: a tile is hidden when terrain at least a tier taller
// than the viewer stands between them, so ridges and walls block what you can SEE.
// Elevation never gates what you can HIT — indirect fire is stopped only by the
// Rampart (`Bulwark`) terrain tag. 'off' (plain Manhattan diamond) and 'raycast'
// remain selectable on the /dev/los playground for comparison.
export const occlusionMode = writable<OcclusionMode>('viewer-relative')
