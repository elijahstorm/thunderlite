import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getMapData } from '$lib/Map/hashLoader'

export const load: PageServerLoad = async ({ params }) => {
	const { mapHash, mapName, mapDeleted } = await getMapData(params.id)
	// Deleted maps stay loadable for games/replays already in flight, but the
	// editor isn't one of those surfaces — block opening it here.
	if (mapDeleted) throw error(404, { message: 'This map has been deleted.' })
	// `mapId` lets the editor save edits back to this same row (mutable maps),
	// keeping the shareable /map/[id] link stable across edits.
	return { mapHash, mapName, mapId: params.id }
}
