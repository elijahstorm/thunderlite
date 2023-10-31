<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
</script>

<div class="flex flex-col h-screen md:hidden">
	<Header />
	<slot />
</div>

<div class="hidden md:block">
	<ContentWithFooter>
		<Casing>
			<div class="pt-6">
				<slot />
			</div>
		</Casing>
	</ContentWithFooter>
</div>
