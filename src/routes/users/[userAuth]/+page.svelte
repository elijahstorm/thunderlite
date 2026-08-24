<script lang="ts">
	import { goto } from '$app/navigation'
	import PoweredByDontCode from '$lib/Components/Branding/PoweredByDontCode.svelte'
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

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
	type Local = { auth: string; relationship: RelationshipStatus | null; following: boolean }
	let local = $state<Local | null>(null)
	let pending = $state('')

	let relationship = $derived(
		local?.auth === user.auth ? local.relationship : (user.relationship ?? null)
	)
	let following = $derived(local?.auth === user.auth ? local.following : (user.following ?? false))

	const override = (patch: Partial<Omit<Local, 'auth'>>) => {
		local = { auth: user.auth, relationship, following, ...patch }
	}

	const message = () => goto(`/chat/${user.auth}`)

	/**
	 * Both relationship endpoints answer with the resulting `RelationshipStatus`,
	 * so the button repaints from the server's word. The optimistic write first
	 * is what makes the click feel instant; a failure rolls it back rather than
	 * leaving a lie on screen.
	 */
	const act = async (action: 'friend-request' | 'block', optimistic: RelationshipStatus) => {
		if (pending) return
		const previous = relationship
		pending = action
		override({ relationship: optimistic })
		try {
			const response = await fetch(`/api/user/${user.auth}/${action}`, { method: 'POST' })
			if (!response.ok) throw new Error(`${response.status}`)
			const result = await response.json()
			override({ relationship: (result?.status as RelationshipStatus) ?? optimistic })
		} catch {
			override({ relationship: previous })
		} finally {
			pending = ''
		}
	}

	const friend = () => act('friend-request', 'friend-request')
	const block = () => act('block', 'blocked')

	const toggleFollow = async () => {
		if (pending) return
		const next = !following
		pending = 'follow'
		override({ following: next })
		try {
			const response = await fetch(`/api/user/${user.auth}/${next ? 'follow' : 'unfollow'}`, {
				method: 'POST',
			})
			if (!response.ok) throw new Error(`${response.status}`)
		} catch {
			override({ following: !next })
		} finally {
			pending = ''
		}
	}

	let friendLabel = $derived(
		relationship === 'friends'
			? 'Friends'
			: relationship === 'friend-request'
				? 'Requested'
				: 'Add friend'
	)
</script>

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
		<div class="flex flex-wrap gap-2">
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
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				disabled={!!pending}
				onclick={toggleFollow}
			>
				{following ? 'Following' : 'Follow'}
			</button>
			<button
				type="button"
				class="btn btn-ghost btn-sm text-destructive"
				disabled={!!pending || relationship === 'blocked'}
				onclick={block}
			>
				{relationship === 'blocked' ? 'Blocked' : 'Block'}
			</button>
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

	<div class="pt-4 border-t border-border">
		<PoweredByDontCode variant="footer" />
	</div>
</section>
