<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { browser } from '$app/environment'
	import { fly } from 'svelte/transition'
	import { userAuth } from '$lib/dontcode/client'
	import { openDmWith } from '$lib/Stores/openDm'
	import { RealtimeConnection, type RealtimeMessage } from '$lib/dontcode/realtimeClient'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import { logChat } from '$lib/Engine/liveLog'

	interface Props {
		/** Game room code. Group chat is scoped to `chat:{session}` — room members only. */
		session?: string
		/** Seat-indexed public profiles for the room, used to attribute messages. */
		roster?: (UserDBData | null)[]
	}

	let { session = '', roster = [] }: Props = $props()

	type GroupMessage = { source: string; message: string; at: number }

	// Games are transient, so group chat is realtime-only (no DB). The channel is
	// authorized exactly like the game channel (must be a member); see /api/realtime.
	const channel = (s: string) => `chat:${s}`

	const isRealSession = (s: string) => !!s && s !== 'ephemeral' && s !== 'testSession'

	let conn: RealtimeConnection | null = null
	let currentAuth: string | null = $state(null)
	let unsubscribeAuth: (() => void) | null = null
	let messages: GroupMessage[] = $state([])
	let open = $state(false)
	let unread = $state(0)
	let draft = $state('')
	let scroller: HTMLDivElement | undefined = $state()

	let byAuth = $derived(
		new Map(roster.filter((user): user is UserDBData => !!user).map((user) => [user.auth, user]))
	)
	const nameFor = (auth: string) =>
		byAuth.get(auth)?.display_name || byAuth.get(auth)?.username || 'Player'

	let seq = 0
	const push = (msg: GroupMessage) => {
		messages = [...messages, msg]
		seq += 1
		if (!open) unread += 1
		// Defer so the new row is in the DOM before we scroll to it.
		queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
	}

	const onGroupMessage = (incoming: RealtimeMessage) => {
		const data = incoming.payload as GroupMessage | undefined
		if (!data?.message) return
		// We render our own sends optimistically; drop the echo if it comes back.
		if (data.source === currentAuth) return
		// Group chat is realtime-only (no DB), so this is the ONLY record of what
		// was said in the room — worth having when reconstructing a reported match.
		// The recorder is a no-op outside a real online session.
		logChat(data.source, data.message, false)
		push(data)
	}

	const connect = async () => {
		if (conn || !isRealSession(session)) return
		const attempt = new RealtimeConnection({ channels: [channel(session)] })
		attempt.subscribe(channel(session), onGroupMessage)
		try {
			await attempt.open()
			conn = attempt
		} catch {
			// No realtime here (e.g. local mock) — group chat is simply unavailable.
			attempt.close()
		}
	}

	const send = () => {
		const message = draft.trim()
		if (!message || !currentAuth || !conn) return
		const msg: GroupMessage = { source: currentAuth, message, at: seq }
		conn.publish(channel(session), msg)
		logChat(currentAuth, message, true)
		push(msg)
		draft = ''
	}

	const toggle = () => {
		open = !open
		if (open) unread = 0
	}

	onMount(() => {
		if (!browser) return
		unsubscribeAuth = userAuth.subscribe((auth) => {
			currentAuth = auth
			if (auth) void connect()
		})
	})

	onDestroy(() => {
		conn?.close()
		if (unsubscribeAuth) unsubscribeAuth()
	})
</script>

{#if isRealSession(session)}
	<div class="fixed bottom-4 left-4 z-40 w-[320px] max-w-[92vw]">
		{#if open}
			<div
				class="rounded-xl border border-border bg-surface shadow-lg overflow-hidden flex flex-col"
				in:fly={{ y: 12, duration: 150 }}
			>
				<header class="flex items-center justify-between px-3 py-2 border-b border-border">
					<span class="text-sm font-semibold">Game chat</span>
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground p-1"
						onclick={toggle}
						aria-label="Close game chat"
					>
						<svg
							class="w-4 h-4"
							viewBox="0 0 20 20"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" d="M5 5l10 10M15 5L5 15" />
						</svg>
					</button>
				</header>

				<div bind:this={scroller} class="h-56 overflow-y-auto px-3 py-2 space-y-2">
					{#if messages.length}
						{#each messages as msg, i (i)}
							<div class="flex items-start gap-2">
								<button
									type="button"
									class="flex-shrink-0"
									onclick={() => msg.source !== currentAuth && openDmWith.set(msg.source)}
									aria-label="Message {nameFor(msg.source)}"
								>
									<UserIcon user={byAuth.get(msg.source) ?? null} noClick size={1.75} />
								</button>
								<div class="min-w-0">
									<button
										type="button"
										class="text-xs font-medium text-muted-foreground hover:text-foreground"
										onclick={() => msg.source !== currentAuth && openDmWith.set(msg.source)}
									>
										{msg.source === currentAuth ? 'You' : nameFor(msg.source)}
									</button>
									<p class="text-sm text-foreground break-words">{msg.message}</p>
								</div>
							</div>
						{/each}
					{:else}
						<p class="text-sm text-muted-foreground text-center pt-6">Say something to the room.</p>
					{/if}
				</div>

				<form
					class="flex items-center gap-2 border-t border-border p-2"
					onsubmit={(e) => {
						e.preventDefault()
						send()
					}}
				>
					<input
						bind:value={draft}
						type="text"
						placeholder="Message the room…"
						autocomplete="off"
						class="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-lg bg-brand-500 hover:bg-brand-400 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
						disabled={!draft.trim()}
					>
						Send
					</button>
				</form>
			</div>
		{:else}
			<button
				type="button"
				class="relative flex items-center gap-2 rounded-full border border-border bg-surface shadow-lg px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
				onclick={toggle}
			>
				<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
					<path
						d="M18 5v8a2 2 0 0 1-2 2h-5l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"
					/>
				</svg>
				Game chat
				{#if unread > 0}
					<span
						class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center"
					>
						{unread}
					</span>
				{/if}
			</button>
		{/if}
	</div>
{/if}
