import { error } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'
import { EDGE_CONFIG } from '$env/static/private'
import { createClient } from '@vercel/edge-config'

export const config = {
	runtime: 'edge',
}

export const load: LayoutServerLoad = async () => {
	const edgeConfig = createClient(EDGE_CONFIG)
	const config = (await edgeConfig.get('public')) as {
		title: string
		desc: string
		googleFonts: string
	}

	if (!config) {
		throw error(404, 'Edge config not pulled')
	}

	return { config }
}
