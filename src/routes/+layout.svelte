<script lang="ts">
	import type { LayoutData } from './$types'
	import { Toasts } from 'as-toast'
	import { browser } from '$app/environment'
	import { initSession } from '$lib/dontcode/client'
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
	$effect(() => {
		if (browser) initSession(data.user)
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

{@render children?.()}

<Toasts />
