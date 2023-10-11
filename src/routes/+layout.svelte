<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import { Toasts } from 'as-toast'
	import '../app.css'
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;500;700;900&family=Roboto:ital,wght@0,100;0,300;0,500;0,700;0,900;1,500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<slot />

<Toasts />
