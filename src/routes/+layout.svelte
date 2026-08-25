<script lang="ts">
	import type { LayoutData } from './$types'
	import { Toasts } from 'as-toast'
	import { browser } from '$app/environment'
	import { initSession, refreshSession } from '$lib/dontcode/client'
	import NavigationProgress from '$lib/Components/Feedback/NavigationProgress.svelte'
	import ServiceBanner from '$lib/Components/Feedback/ServiceBanner.svelte'
	import { watchServiceHealth } from '$lib/Stores/serviceHealth'
	import '../app.css'

	interface Props {
		data: LayoutData
		children?: import('svelte').Snippet
	}

	let { data, children }: Props = $props()

	const title = $derived(data.config.title)
	const desc = $derived(data.config.desc)
	const googleFonts = $derived(data.config.googleFonts)
	const IMG_URL = `/images/embedded-card.png`

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

<svelte:head>
	<title>{title}</title>
	<meta property="description" content={desc} />

	<meta property="og:title" content={title} />
	<meta property="og:description" content={desc} />
	<meta property="og:image" content={IMG_URL} />
	<meta property="og:url" content="/" />

	<meta property="twitter:title" content={title} />
	<meta property="twitter:description" content={desc} />
	<meta property="twitter:image" content={IMG_URL} />
	<meta property="twitter:card" content="summary_large_image" />

	{#if googleFonts}
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
		<link href={googleFonts} rel="stylesheet" />
	{/if}
</svelte:head>

<NavigationProgress />
<ServiceBanner />

{@render children?.()}

<Toasts />
