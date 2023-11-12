<script lang="ts">
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	export let user: UserDBData | null
	export let text = false
</script>

<div class="flex items-center">
	<UserIcon auth={user?.auth} size={2.5} />
	{#if text}
		<div class="ml-4 text-left">
			<div class="uppercase tracking-wide text-sm text-black dark:text-white font-semibold">
				{user?.display_name ?? '...'}
			</div>
			<div class="text-gray-400 dark:text-gray-300">@{user?.username ?? '...'}</div>
		</div>
	{/if}
</div>
