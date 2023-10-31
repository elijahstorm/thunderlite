<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
</script>

<ContentWithFooter>
	<Casing>
		<div class="pt-16">
			<slot />
		</div>
	</Casing>
</ContentWithFooter>
