<script lang="ts">
	import { goto } from '$app/navigation'
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	export let data
	$: user = data.user
	$: stats = data.stats
	$: maps = data.maps ?? []
	$: isMe = !!data.me && data.me === user.auth
	$: canAct = !!data.me && !isMe

	// Optimistic local state seeded from the server's relationship snapshot.
	let relationship = data.user.relationship ?? null
	let following = data.user.following ?? false

	const message = () => goto(`/chat/${user.auth}`)

	const friend = async () => {
		await fetch(`/api/user/${user.auth}/friend-request`, { method: 'POST' })
			.then((r) => r.json())
			.then((res) => (relationship = res?.status ?? 'friend-request'))
			.catch(() => {})
	}

	const toggleFollow = async () => {
		const next = !following
		following = next
		await fetch(`/api/user/${user.auth}/${next ? 'follow' : 'unfollow'}`, {
			method: 'POST',
		}).catch(() => (following = !next))
	}

	const block = async () => {
		await fetch(`/api/user/${user.auth}/block`, { method: 'POST' })
			.then((r) => r.json())
			.then((res) => (relationship = res?.status ?? 'blocked'))
			.catch(() => {})
	}

	$: friendLabel =
		relationship === 'friends'
			? 'Friends'
			: relationship === 'friend-request'
				? 'Requested'
				: 'Add friend'
</script>

<section class="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
	<header class="flex items-start gap-4">
		<UserIcon {user} noClick size={4} />
		<div class="min-w-0 flex-1">
			<p class="section-eyebrow">Player</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
				{user.display_name || user.username || 'Player'}
			</h1>
			{#if user.username}
				<p class="text-sm text-muted-foreground mt-1">@{user.username}</p>
			{/if}
			{#if user.bio}
				<p class="text-sm text-muted-foreground mt-2">{user.bio}</p>
			{/if}
		</div>
	</header>

	{#if canAct}
		<div class="flex flex-wrap gap-2">
			<button type="button" class="btn btn-primary btn-sm" on:click={message}>Message</button>
			<button
				type="button"
				class="btn btn-sm"
				class:btn-ghost={relationship !== 'friends'}
				disabled={relationship === 'friends' || relationship === 'friend-request'}
				on:click={friend}
			>
				{friendLabel}
			</button>
			<button type="button" class="btn btn-ghost btn-sm" on:click={toggleFollow}>
				{following ? 'Following' : 'Follow'}
			</button>
			<button type="button" class="btn btn-ghost btn-sm text-destructive" on:click={block}>
				{relationship === 'blocked' ? 'Blocked' : 'Block'}
			</button>
		</div>
	{/if}

	<StatsPanel {stats} heading="Match record" />

	<section class="space-y-3">
		<h2 class="text-lg font-semibold tracking-tight text-foreground">Saved maps</h2>
		{#if maps.length}
			<div class="grid gap-5">
				{#each maps as map (map.public_id)}
					<a
						href="/map/{map.public_id}"
						class="block w-full text-left rounded-xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring hover:-translate-y-0.5"
					>
						<MapCard {map} />
					</a>
				{/each}
			</div>
		{:else}
			<div class="card p-10 text-center text-sm text-muted-foreground">
				{user.display_name || 'This player'} hasn't shared any maps yet.
			</div>
		{/if}
	</section>
</section>
