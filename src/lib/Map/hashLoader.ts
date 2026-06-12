import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db } from '$lib/Server/dontcode'

export const getMapHash = async (sha: string) => {
	let map: { url: string } | null

	try {
		map = await db.findOne<{ url: string }>('maps', { where: { sha }, select: ['url'] })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}

	const url = map?.url
	if (!url) {
		throw error(400, { message: 'No map with that SHA found.' })
	}

	const mapResponse = await fetch(url)

	if (!mapResponse.ok) {
		throw error(404, 'No map data found')
	}

	const mapHash = await mapResponse.text()

	return { mapHash }
}

export const isValidMapHash = async (sha: string) => {
	try {
		return (await db.count('maps', { sha })) > 0
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not perform count check on database')
	}
}
