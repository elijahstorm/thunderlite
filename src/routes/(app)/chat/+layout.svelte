<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
</script>

<ContentWithFooter noFooterOnMobile>
	<Header />

	<div class="md:container w-full break break-word">
		<slot />
	</div>
</ContentWithFooter>
