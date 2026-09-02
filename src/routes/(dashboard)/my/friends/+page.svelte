<script lang="ts">
	import Icon from '@iconify/svelte'
	import { invalidateAll } from '$app/navigation'
	import type { PageData } from './$types'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	// Rows the server still lists but that this session has already resolved.
	// The reload behind an accept/decline is a full `invalidateAll`, so without
	// this the row would sit there unchanged until the response came back.
	let settled = $state<Record<string, 'accepted' | 'dismissed'>>({})
	let pending = $state('')

	let incoming = $derived(data.incoming.filter((user) => !settled[user.auth]))
	let outgoing = $derived(data.outgoing.filter((user) => !settled[user.auth]))
	let accepted = $derived(data.incoming.filter((user) => settled[user.auth] === 'accepted'))
	// The just-accepted rows lead the list until the reload lands. Deduped by
	// auth because for one render both sources can hold the same person, and a
	// keyed `each` will not tolerate the collision.
	let friends = $derived(
		[...accepted, ...data.friends].filter(
			(user, index, all) => all.findIndex((other) => other.auth === user.auth) === index
		)
	)

	const name = (user: UserDBData) => user.display_name || user.username || 'Player'

	/** Accepting is just asking back: the API pairs the two requests into a friendship. */
	const accept = async (user: UserDBData) => {
		if (pending) return
		pending = user.auth
		settled = { ...settled, [user.auth]: 'accepted' }
		try {
			const response = await fetch(`/api/user/${user.auth}/friend-request`, { method: 'POST' })
			if (!response.ok) throw new Error(`${response.status}`)
			await invalidateAll()
		} catch {
			settled = Object.fromEntries(Object.entries(settled).filter(([auth]) => auth !== user.auth))
		} finally {
			pending = ''
		}
	}

	/** Declines one you received and cancels one you sent; the API clears either way. */
	const dismiss = async (user: UserDBData) => {
		if (pending) return
		pending = user.auth
		settled = { ...settled, [user.auth]: 'dismissed' }
		try {
			const response = await fetch(`/api/user/${user.auth}/friend-request`, { method: 'DELETE' })
			if (!response.ok) throw new Error(`${response.status}`)
			await invalidateAll()
		} catch {
			settled = Object.fromEntries(Object.entries(settled).filter(([auth]) => auth !== user.auth))
		} finally {
			pending = ''
		}
	}
</script>

<svelte:head>
	<title>Friends | ThunderLite</title>
</svelte:head>

{#snippet identity(user: UserDBData)}
	<a class="flex min-w-0 flex-1 items-center gap-3" href="/users/{user.auth}">
		<UserIcon {user} noClick size={2.5} />
		<span class="min-w-0 leading-tight">
			<span class="flex items-center gap-2">
				<span class="truncate text-sm font-medium text-foreground">{name(user)}</span>
				<RatingBadge elo={user.elo} size="xs" hideUnrated />
			</span>
			{#if user.username}
				<span class="block truncate text-xs text-muted-foreground">@{user.username}</span>
			{/if}
		</span>
	</a>
{/snippet}

<section class="space-y-8">
	<header>
		<p class="section-eyebrow">Community</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">Friends</h1>
	</header>

	{#if incoming.length}
		<div class="space-y-3">
			<h2 class="text-sm font-semibold tracking-tight text-foreground">
				Friend requests
				<span class="ml-1 text-muted-foreground">({incoming.length})</span>
			</h2>
			<ul class="card divide-y divide-border">
				{#each incoming as user (user.auth)}
					<li class="flex flex-wrap items-center gap-3 p-4">
						{@render identity(user)}
						<div class="flex shrink-0 gap-2">
							<button
								type="button"
								class="btn btn-primary btn-sm"
								disabled={!!pending}
								onclick={() => accept(user)}
							>
								Accept
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={!!pending}
								onclick={() => dismiss(user)}
							>
								Ignore
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="space-y-3">
		<h2 class="text-sm font-semibold tracking-tight text-foreground">Your friends</h2>
		{#if friends.length}
			<ul class="card divide-y divide-border">
				{#each friends as user (user.auth)}
					<li class="flex flex-wrap items-center gap-3 p-4">
						{@render identity(user)}
						<a class="btn btn-ghost btn-sm shrink-0" href="/chat/{user.auth}">
							<Icon icon="lucide:message-circle" width={14} />
							Message
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="card p-10 text-center">
				<Icon icon="lucide:users" width={28} class="mx-auto text-muted-foreground" />
				<p class="mt-3 font-medium text-foreground">No friends yet</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Open a player's profile and pick Add friend.
				</p>
				<a class="btn btn-primary mt-4" href="/rooms">Find a game</a>
			</div>
		{/if}
	</div>

	{#if outgoing.length}
		<div class="space-y-3">
			<h2 class="text-sm font-semibold tracking-tight text-foreground">Sent requests</h2>
			<ul class="card divide-y divide-border">
				{#each outgoing as user (user.auth)}
					<li class="flex flex-wrap items-center gap-3 p-4">
						{@render identity(user)}
						<div class="flex shrink-0 items-center gap-3">
							<span class="text-xs text-muted-foreground">Waiting</span>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={!!pending}
								onclick={() => dismiss(user)}
							>
								Cancel
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
