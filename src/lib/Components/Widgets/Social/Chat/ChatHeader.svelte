<script lang="ts">
	import UserImageAndName from '../UserImageAndName.svelte'

	interface Props {
		user: UserDBData
		highlight?: boolean
		ontoggle?: () => void
	}

	let { user, highlight = false, ontoggle }: Props = $props()
</script>

<header
	class="flex items-center justify-between gap-2 px-4 pb-3 border-b border-border"
	class:pt-5={!highlight}
	class:pt-4={highlight}
>
	<!-- Name + avatar open the full profile (saved maps, add friend, etc.). -->
	<a
		href={user ? `/users/${user.auth}` : '#'}
		class="flex items-center min-w-0 rounded-lg hover:bg-muted transition-colors -mx-1 px-1 py-1"
	>
		<UserImageAndName {user} text noClick />
	</a>
	<button
		type="button"
		aria-label="Close conversation"
		class="text-muted-foreground hover:text-foreground rounded-full p-1"
		onclick={(e) => {
			e.stopPropagation()
			ontoggle?.()
		}}
	>
		<svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" d="M5 5l10 10M15 5L5 15" />
		</svg>
	</button>
</header>
