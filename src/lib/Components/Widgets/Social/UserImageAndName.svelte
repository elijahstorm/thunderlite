<script lang="ts">
	export let user: UserDBData | null
	export let text = false
</script>

<div class="flex items-center">
	<img
		src={user?.profile_image_url}
		alt="{user?.username} Profile"
		class="rounded-full"
		height="40"
		width="40"
		style="aspect-ratio:40/40;object-fit:cover"
	/>
	{#if text}
		<div class="ml-4">
			<div class="uppercase tracking-wide text-sm text-black dark:text-white font-semibold">
				{user?.display_name ?? '...'}
			</div>
			<div class="text-gray-400 dark:text-gray-300">@{user?.username ?? '...'}</div>
		</div>
	{/if}
</div>
