<script lang="ts">
	import type { LayoutData } from './$types'
	import { PUBLIC_URL } from '$env/static/public'
	import { Toasts } from 'as-toast'
	import '../app.css'

	export let data: LayoutData

	const { title, desc, googleFonts } = data.config
	const IMG_URL = `${PUBLIC_URL}images/embedded-card.png`
</script>

<svelte:head>
	<title>{title}</title>
	<meta property="description" content={desc} />

	<meta property="og:title" content={title} />
	<meta property="og:description" content={desc} />
	<meta property="og:image" content={IMG_URL} />
	<meta property="og:url" content={PUBLIC_URL} />

	<meta property="twitter:title" content={title} />
	<meta property="twitter:description" content={desc} />
	<meta property="twitter:image" content={IMG_URL} />
	<meta property="twitter:card" content="summary_large_image" />

	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link href={googleFonts} rel="stylesheet" />
</svelte:head>

<slot />

<Toasts />
