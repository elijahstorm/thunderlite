import type { PageServerLoad } from './$types'
import { getMapData } from '$lib/Map/hashLoader'

export const load: PageServerLoad = async ({ params }) => {
	const { mapHash, mapName } = await getMapData(params.id)
	// `mapId` lets the editor save edits back to this same row (mutable maps),
	// keeping the shareable /map/[id] link stable across edits.
	return { mapHash, mapName, mapId: params.id }
}
