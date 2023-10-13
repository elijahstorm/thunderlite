<script lang="ts">
	import { PUBLIC_GAME_NAME, PUBLIC_URL } from '$env/static/public'
	import { Toasts } from 'as-toast'
	import '../app.css'

	const TITLE = PUBLIC_GAME_NAME
	const DESC = 'Play an Advance Wars style online game'
	const IMG_URL = `${PUBLIC_URL}images/embedded-card.png`
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta property="description" content={DESC} />

	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESC} />
	<meta property="og:image" content={IMG_URL} />
	<meta property="og:url" content={PUBLIC_URL} />

	<meta property="twitter:title" content={TITLE} />
	<meta property="twitter:description" content={DESC} />
	<meta property="twitter:image" content={IMG_URL} />
	<meta property="twitter:card" content="summary_large_image" />

	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;500;700;900&family=Roboto:ital,wght@0,100;0,300;0,500;0,700;0,900;1,500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<slot />

<Toasts />
