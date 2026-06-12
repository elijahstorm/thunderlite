import { db } from '$lib/dontcode/server'

export const getMapTypes = async () =>
	(await db.find<{ text: string }>('map_types', { select: ['text'] })).map((type) => type.text)
