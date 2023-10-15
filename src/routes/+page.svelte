<script lang="ts">
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import LandingPage from '$lib/Components/PageContainers/LandingPage.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
</script>

<svelte:head>
	<title>Haja: Do Together</title>
</svelte:head>

<ContentWithFooter>
	<Header />
	<LandingPage />
</ContentWithFooter>
