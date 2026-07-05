import type { LayoutServerLoad } from './$types'
import { kv } from '$lib/dontcode/server'

interface SiteConfig {
	title: string
	desc: string
	googleFonts: string
}

// Served when the KV entry is absent (fresh project, local mock gateway — the
// mock has no cache, so reads come back as misses) or the cache is unreachable.
// The site must render either way; KV only overrides copy, it never gates it.
const DEFAULT_CONFIG: SiteConfig = {
	title: 'ThunderLite',
	desc: 'Turn-based tactics. Build, capture, and outmaneuver — in your browser.',
	googleFonts: '',
}

/**
 * Site title/description/fonts, editable without a deploy. Formerly Vercel
 * Edge Config; now a DontCode KV entry. Seed or update it with:
 *   pnpm kv:check --seed-site
 * (or `kv.set('site:config', {...})` from any server code).
 */
const siteConfig = async (): Promise<SiteConfig> => {
	try {
		const config = await kv.get<Partial<SiteConfig>>('site:config')
		if (!config) return DEFAULT_CONFIG
		return { ...DEFAULT_CONFIG, ...config }
	} catch {
		return DEFAULT_CONFIG
	}
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const config = await siteConfig()

	// Hand the already-resolved session to the client so it can render the
	// signed-in state on first paint instead of round-tripping /api/auth/me.
	const user = locals.user ? { id: locals.user, email: locals.userEmail ?? null } : null

	return { config, user }
}
