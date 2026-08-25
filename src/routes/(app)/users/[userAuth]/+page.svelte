<script lang="ts">
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import { openDmWith } from '$lib/Stores/openDm'

	let { data } = $props()
	let user = $derived(data.user)
	let stats = $derived(data.stats)
	let eloHistory = $derived(data.eloHistory)
	let maps = $derived(data.maps ?? [])
	let isMe = $derived(!!data.me && data.me === user.auth)
	let canAct = $derived(!!data.me && !isMe)

	// Optimistic local state layered over the server's snapshot. It is stamped
	// with the profile it belongs to: SvelteKit reuses this component when you
	// navigate from one player to the next, so an override that wasn't keyed
	// would follow you onto the next profile.
	type Local = { auth: string; relationship: RelationshipStatus | null }
	let local = $state<Local | null>(null)
	let pending = $state('')

	let relationship = $derived(
		local?.auth === user.auth ? local.relationship : (user.relationship ?? null)
	)

	// `user.blocked` collapses both directions, and the server never says which
	// side owns the block. Subtracting the viewer's own row from it recovers the
	// half they cannot act on, and that half is pure server truth: nothing the
	// viewer clicks can change whether the other player blocked them, so it is
	// read straight off the load rather than through the optimistic layer.
	let blockedMe = $derived((user.blocked ?? false) && user.relationship !== 'blocked')
	let iBlocked = $derived(relationship === 'blocked')
	let blocked = $derived(iBlocked || blockedMe)

	const override = (patch: Partial<Omit<Local, 'auth'>>) => {
		local = { auth: user.auth, relationship, ...patch }
	}

	// The (app) layout owns the DM dock, so messaging pops the conversation open
	// in place rather than navigating away from the profile you're reading.
	const message = () => openDmWith.set(user.auth)

	/**
	 * Both relationship endpoints answer with the resulting `RelationshipStatus`,
	 * so the button repaints from the server's word. The optimistic write first
	 * is what makes the click feel instant; a failure rolls it back rather than
	 * leaving a lie on screen.
	 */
	const act = async (
		action: 'friend-request' | 'block',
		method: 'POST' | 'DELETE',
		optimistic: RelationshipStatus
	) => {
		if (pending) return
		const previous = relationship
		pending = action
		override({ relationship: optimistic })
		try {
			const response = await fetch(`/api/user/${user.auth}/${action}`, { method })
			if (!response.ok) throw new Error(`${response.status}`)
			const result = await response.json()
			override({ relationship: (result?.status as RelationshipStatus) ?? optimistic })
		} catch {
			override({ relationship: previous })
		} finally {
			pending = ''
		}
	}

	const friend = () => act('friend-request', 'POST', 'friend-request')
	const block = () => act('block', 'POST', 'blocked')

	// Lifts only the viewer's own block. If the other player blocked them too the
	// pair stays blocked, which `blockedMe` above keeps honest.
	const unblock = () => act('block', 'DELETE', 'unknown')

	let friendLabel = $derived(
		relationship === 'friends'
			? 'Friends'
			: relationship === 'friend-request'
				? 'Requested'
				: 'Add friend'
	)
</script>

<ContentWithFooter>
	<Header />

	<section class="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
		<header class="flex items-start gap-4">
			<UserIcon {user} noClick size={4} />
			<div class="min-w-0 flex-1">
				<p class="section-eyebrow">Player</p>
				<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
					<h1 class="text-2xl font-semibold tracking-tight text-foreground">
						{user.display_name || user.username || 'Player'}
					</h1>
					<RatingBadge elo={stats?.elo} size="md" />
				</div>
				{#if user.username}
					<p class="text-sm text-muted-foreground mt-1">@{user.username}</p>
				{/if}
				{#if user.bio}
					<p class="text-sm text-muted-foreground mt-2">{user.bio}</p>
				{/if}
			</div>
		</header>

		{#if canAct}
			<div class="flex flex-wrap items-center gap-2">
				<!-- Messaging and friending are dead while the pair is blocked in
				     either direction, so the buttons go rather than sit there failing.
				     Which side blocked is deliberately not spelled out. -->
				{#if !blocked}
					<button type="button" class="btn btn-primary btn-sm" onclick={message}>Message</button>
					<button
						type="button"
						class="btn btn-sm"
						class:btn-ghost={relationship !== 'friends'}
						disabled={!!pending || relationship === 'friends' || relationship === 'friend-request'}
						onclick={friend}
					>
						{friendLabel}
					</button>
				{:else}
					<p class="text-sm text-muted-foreground">You and this player can't message each other.</p>
				{/if}
				{#if iBlocked}
					<button type="button" class="btn btn-ghost btn-sm" disabled={!!pending} onclick={unblock}>
						Unblock
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-ghost btn-sm text-destructive"
						disabled={!!pending}
						onclick={block}
					>
						Block
					</button>
				{/if}
			</div>
		{/if}

		<StatsPanel {stats} history={eloHistory} heading="Match record" />

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
</ContentWithFooter>
