import { terrainData } from '$lib/GameData/terrain'

// Raw terrain heights are expressed in tiers of this size. The whole height-based
// system — sight radius (Extra_Sight), fog line-of-sight occlusion, the high-ground
// combat bonus, and indirect-fire shadows — reasons in tiers rather than raw height
// so the rules stay legible and the terrain table stays the single source of truth.
//
// Current terrain heights map to tiers: Plains/Road/Sea/Wasteland/Shore 0,
// Forest(5)/Reef(10)/Bridge(10) 0, Hills/Archipelago/High Bridge(20) 1,
// Mountain(50) 2, Volcano(100) 5, Canyon(-10) -1.
export const TIER_SIZE = 20

// A unit's eyes (and the muzzle of a direct weapon) sit this far above the terrain
// it stands on — less than a full tier, so any terrain one tier taller genuinely
// blocks the sightline. Used by the raycast occlusion model.
export const EYE_HEIGHT = 10

export const heightTier = (height: number): number => Math.floor(height / TIER_SIZE)

export const tileHeight = (map: Pick<MapObject, 'layers'>, tile: number): number =>
	terrainData[map.layers.ground[tile]?.type]?.height ?? 0

export const tileHeightTier = (map: Pick<MapObject, 'layers'>, tile: number): number =>
	heightTier(tileHeight(map, tile))
