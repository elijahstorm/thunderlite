<script lang="ts">
	import { page } from '$app/stores'
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
</script>

<ContentWithFooter>
	<Casing>
		<section class="flex flex-col items-center pt-8">
			<div class="max-w-lg space-y-6">
				<p class="text-center text-lg">
					<span class="font-bold text-xl">
						{$page.status}:
					</span>
					{$page.error?.message}
				</p>

				<FallbackImage alt={`${$page.status}, ${$page.error?.message}`} />
			</div>
		</section>
	</Casing>
</ContentWithFooter>
