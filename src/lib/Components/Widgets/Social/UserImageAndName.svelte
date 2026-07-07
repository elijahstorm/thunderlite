<script lang="ts">
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	interface Props {
		user: UserDBData | null
		text?: boolean
		noClick?: boolean
	}

	let { user, text = false, noClick = false }: Props = $props()
</script>

<div class="flex items-center gap-3">
	<UserIcon auth={user?.auth} size={2.25} {noClick} />
	{#if text}
		<div class="leading-tight">
			<div class="text-sm font-medium text-foreground">
				{user?.display_name ?? '…'}
			</div>
			<div class="text-xs text-muted-foreground">@{user?.username ?? '…'}</div>
		</div>
	{/if}
</div>
