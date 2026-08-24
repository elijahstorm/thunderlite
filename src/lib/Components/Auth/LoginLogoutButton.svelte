<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from './UserIcon.svelte'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'
	import { userAuth } from '$lib/dontcode/client'

	// The signed-in avatar already fetches the viewer's own profile, and that
	// profile now carries their ladder rating — so the header can show it on
	// every page for free, no extra request. Hidden until they've actually
	// played a rated game: an "Unrated" chip in the chrome of every page is
	// noise, and the profile page is where that state is explained.
	let me = $state<UserDBData | null>(null)
</script>

<div class="flex items-center gap-2">
	{#if $userAuth === null}
		<a class="btn btn-primary btn-sm" href="/login">
			<span>Sign in</span>
			<Icon icon="lucide:arrow-right" width={14} />
		</a>
	{:else}
		{#if me?.elo != null}
			<a href="/me" class="hidden sm:block" aria-label="Your ladder rating">
				<RatingBadge elo={me.elo} />
			</a>
		{/if}
		<UserIcon auth={$userAuth} bind:user={me} href="/me" />
		<a
			href="/logout"
			class="btn btn-ghost btn-sm text-muted-foreground hover:text-foreground"
			aria-label="Log out"
		>
			<Icon icon="lucide:log-out" width={16} />
			<span class="hidden sm:inline">Log out</span>
		</a>
	{/if}
</div>
