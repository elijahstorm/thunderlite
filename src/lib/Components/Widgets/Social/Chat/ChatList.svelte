<script lang="ts">
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import UserImageAndName from '../UserImageAndName.svelte'
	import { browser } from '$app/environment'
	import { writable, type Writable } from 'svelte/store'
	import { onDestroy, onMount } from 'svelte'

	interface Props {
		socketMessages: Writable<
			(MessageDBData & {
				created_at: Date
				read_at: Date | null
			})[]
		>
		highlight?: boolean
		onchat?: (userAuth: string) => void
		ontoggle?: () => void
	}

	let { socketMessages, highlight = false, onchat, ontoggle }: Props = $props()

	let auth = writable<string | null>(null)
	let me: Promise<UserDBData> | undefined = $state()

	// Two ways to find someone to talk to: who's signed in right now (realtime
	// presence, polled) and your friends (persisted). In-game players are opened
	// straight from the game roster, not this panel.
	const online = writable<UserDBData[]>([])
	const friends = writable<UserDBData[]>([])
	let loadingFriends = $state(true)
	let onlineTimer: ReturnType<typeof setInterval> | null = null

	const ONLINE_POLL_MS = 12_000

	const refreshOnline = () =>
		fetch('/api/chat/online')
			.then((r) => r.json())
			.then((data) => ($online = (data.users as UserDBData[]) ?? []))
			.catch(() => {})

	const loadFriends = () =>
		fetch('/api/users/friends?page=0')
			.then((r) => r.json())
			.then((data) => ($friends = (data.users as UserDBData[]) ?? []))
			.catch(() => {})
			.finally(() => (loadingFriends = false))

	const openChatRoom = (userAuth: string) => onchat?.(userAuth)

	// Online takes priority; a friend who is also online shows only in the top
	// section so nobody appears twice.
	let onlineAuths = $derived(new Set($online.map((user) => user.auth)))
	let offlineFriends = $derived($friends.filter((user) => !onlineAuths.has(user.auth)))

	// A live DM updates the sender's preview + unread mark in the friends list.
	// If the sender isn't listed yet, a presence refresh pulls them into "Online
	// now" so there's always a row to open.
	let lastSeen = $state(0)
	$effect(() => {
		const fresh = $socketMessages.slice(lastSeen)
		if (fresh.length) {
			lastSeen = $socketMessages.length
			const known = new Set([...$online, ...$friends].map((user) => user.auth))
			for (const msg of fresh) {
				if (!known.has(msg.source)) {
					void refreshOnline()
					continue
				}
				$friends = $friends.map((user) =>
					user.auth === msg.source
						? {
								...user,
								last_message: { message: msg.message, unread: true, when: msg.created_at },
							}
						: user
				)
			}
		}
	})

	const timeSince = (when?: Date | string | null, now = new Date()) => {
		if (!when) return ''
		const diff = Math.floor((now.getTime() - new Date(when).getTime()) / 1000)
		if (diff < 60) return 'now'
		if (diff < 3600) return `${Math.floor(diff / 60)}m`
		if (diff < 86400) return `${Math.floor(diff / 3600)}h`
		if (diff < 604800) return `${Math.floor(diff / 86400)}d`
		return `${Math.floor(diff / 604800)}w`
	}

	let unsubscribeAuth: (() => void) | null = null

	onMount(() => {
		if (!browser) return
		import('$lib/dontcode/client').then((session) => {
			auth = session.userAuth
			// Keep the subscription so a late-arriving auth still populates the
			// header avatar (the store may be null on first paint).
			unsubscribeAuth = auth.subscribe((value) => {
				if (value && !me) {
					me = fetch(`/api/user/${value}`)
						.then((r) => r.json())
						.then((data) => data.user)
				}
			})
		})
		loadFriends()
		refreshOnline()
		onlineTimer = setInterval(refreshOnline, ONLINE_POLL_MS)
	})

	onDestroy(() => {
		if (onlineTimer) clearInterval(onlineTimer)
		if (unsubscribeAuth) unsubscribeAuth()
	})
</script>

<section class="antialiased text-foreground w-[340px] max-w-[92vw]">
	<header
		class="flex items-center justify-between gap-2 px-4 border-b border-border"
		class:pt-5={!highlight}
		class:pt-4={highlight}
		class:pb-3={true}
	>
		<button
			type="button"
			class="flex items-center gap-3 min-w-0"
			onclick={(e) => {
				e.stopPropagation()
				ontoggle?.()
			}}
			aria-label="Toggle chat"
		>
			{#await me}
				<Loader size={20} />
			{:then user}
				<UserImageAndName user={user ?? null} text noClick />
			{/await}
		</button>
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground rounded-full p-1"
			class:hidden={highlight}
			onclick={(e) => {
				e.stopPropagation()
				ontoggle?.()
			}}
			aria-label="Close"
		>
			<svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" d="M5 5l10 10M15 5L5 15" />
			</svg>
		</button>
	</header>

	<div class="max-h-96 h-96 overflow-y-auto px-2 py-3 space-y-4">
		<!-- Online now -->
		<div>
			<h3 class="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
				Online now
			</h3>
			{#if $online.length}
				{#each $online as user (user.auth)}
					<button
						type="button"
						class="w-full text-left rounded-lg px-2 py-2 hover:bg-muted transition-colors flex items-center gap-3"
						onclick={() => openChatRoom(user.auth)}
					>
						<div class="relative flex-shrink-0">
							<UserIcon {user} noClick size={2.25} />
							<span
								class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-surface"
							></span>
						</div>
						<div class="min-w-0">
							<div class="text-sm font-medium truncate">{user.display_name || user.username}</div>
							<div class="text-xs text-muted-foreground">Online</div>
						</div>
					</button>
				{/each}
			{:else}
				<p class="px-2 py-2 text-sm text-muted-foreground">No one else is online right now.</p>
			{/if}
		</div>

		<!-- Friends -->
		<div>
			<h3 class="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
				Friends
			</h3>
			{#if loadingFriends}
				<div class="px-2 py-2"><Loader size={20} /></div>
			{:else if offlineFriends.length}
				{#each offlineFriends as user (user.auth)}
					<button
						type="button"
						class="w-full text-left rounded-lg px-2 py-2 hover:bg-muted transition-colors flex items-center gap-3"
						onclick={() => openChatRoom(user.auth)}
					>
						<UserIcon {user} noClick size={2.25} />
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium truncate">{user.display_name || user.username}</div>
							<div
								class="text-xs flex gap-2"
								class:font-semibold={user.last_message?.unread}
								class:text-foreground={user.last_message?.unread}
								class:text-muted-foreground={!user.last_message?.unread}
							>
								<span class="truncate">{user.last_message?.message ?? 'Say hi'}</span>
								{#if user.last_message?.when}
									<span>· {timeSince(user.last_message.when)}</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			{:else}
				<p class="px-2 py-2 text-sm text-muted-foreground">
					Add friends from a player's profile to see them here.
				</p>
			{/if}
		</div>
	</div>
</section>
