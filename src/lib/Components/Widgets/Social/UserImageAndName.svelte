<script lang="ts">
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	export let user: UserDBData | null
	export let text = false
	export let noClick = false
</script>

<div class="flex items-start justify-start">
	<UserIcon auth={user?.auth} size={2.5} {noClick} />
	{#if text}
		<div class="ml-4 text-left">
			<div class="tracking-wide text-sm text-black opacity-80 dark:text-white font-medium">
				{user?.display_name ?? '...'}
			</div>
			<div class="text-xs text-gray-400 dark:text-gray-300">@{user?.username ?? '...'}</div>
		</div>
	{/if}
</div>
