<script lang="ts">
	import type { LayoutData } from './$types'
	import { Toasts } from 'as-toast'
	import { page } from '$app/state'
	import { browser } from '$app/environment'
	import { initSession, refreshSession } from '$lib/dontcode/client'
	import NavigationProgress from '$lib/Components/Feedback/NavigationProgress.svelte'
	import ServiceBanner from '$lib/Components/Feedback/ServiceBanner.svelte'
	import { watchServiceHealth } from '$lib/Stores/serviceHealth'
	import SeoHead from '$lib/Components/Seo/SeoHead.svelte'
	import { resolveSeo, type PageSeo } from '$lib/Seo/seo'
	import '../app.css'

	interface Props {
		data: LayoutData
		children?: import('svelte').Snippet
	}

	let { data, children }: Props = $props()

	const googleFonts = $derived(data.config.googleFonts)

	// Every meta tag on the site is rendered once, here, so no page can end up
	// with two descriptions or a canonical that disagrees with its og:url. A
	// page opts into its own copy by returning `seo` from its load function;
	// anything that doesn't falls back to the KV-editable site config, and
	// signed-in/dev routes are noindexed by path (see NOINDEX_PREFIXES).
	const seo = $derived(
		resolveSeo(page.url.pathname, page.data.seo as PageSeo | undefined, {
			title: data.config.title,
			description: data.config.desc,
		})
	)

	// Seed the client session stores from the server-resolved user. Kept to the
	// browser so the module-level stores are never mutated during SSR (which
	// would leak one request's user into another's render).
	//
	// On a prerendered route (`/`) this payload was baked at build time, so its
	// `user` is always null regardless of who's actually signed in — seeding
	// from it would log the visitor out of the UI for the rest of the session.
	// Ask the server instead. `refreshSession` only clears the stores once it
	// has an answer, so an already-signed-in user never flashes as logged out.
	$effect(() => {
		if (!browser) return
		if (data.prerendered) refreshSession()
		else initSession(data.user)
	})

	// One observational wrapper around fetch, installed before anything else runs
	// a request, so every existing call site reports backend health for free.
	$effect(() => {
		watchServiceHealth()
	})
</script>

<SeoHead {seo} {googleFonts} />

<NavigationProgress />
<ServiceBanner />

{@render children?.()}

<Toasts />
