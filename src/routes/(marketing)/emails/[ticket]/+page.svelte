<script lang="ts">
	import type { PageData } from "./$types"

	export let data: PageData
	export let errors: string | null

	let { message } = data
	$: ({ message } = data)
</script>

{#if errors}
	<p class="text-red-500">{errors}</p>
{:else}
	<div class="flex flex-col gap-3">
		<div>
			{@html message.html}
		</div>
	</div>
{/if}
