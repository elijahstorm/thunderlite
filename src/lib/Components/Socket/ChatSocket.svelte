<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { writable } from 'svelte/store'
	import { browser } from '$app/environment'
	import { userAuth } from '$lib/dontcode/client'
	import { RealtimeConnection, type RealtimeMessage } from '$lib/dontcode/realtimeClient'
	import { fly } from 'svelte/transition'

	type SocketMessage = {
		message: string
		source: string
		target: string
	}

	// Chat rides the DontCode realtime service. Each client joins two channels:
	//   chat:global — presence only, so /api/chat/online can list who's signed in
	//   dm:{myAuth} — this user's private inbox; DMs are published here by the
	//                 server (see /api/user/[userAuth]/message), so nobody else's
	//                 conversation ever reaches this client.
	// The connection token is minted by /api/realtime (identity = profile auth).
	const PRESENCE_CHANNEL = 'chat:global'
	const inboxChannel = (auth: string) => `dm:${auth}`

	const socketMessages = writable<
		(SocketMessage & {
			created_at: Date
			read_at: Date | null
		})[]
	>([])
	const refreshTimeout = writable<ReturnType<typeof setTimeout> | null>()
	let conn: RealtimeConnection | null = null
	let unsubscribeAuth: (() => void) | null = null
	let error = false
	/** undefined until a connection succeeds or fails; drives the offline pill. */
	let opened: boolean | undefined = undefined
	/** Realtime is not served here (e.g. local mock gateway) — disable chat quietly. */
	let unavailable = false

	const onChatMessage = (incoming: RealtimeMessage) => {
		const data = incoming.payload as SocketMessage | undefined
		if (!data?.message) return
		// Only our own inbox delivers here, but guard anyway: never echo our own
		// sends (ChatRoom renders those optimistically) or anything misaddressed.
		if (data.source && data.source === currentAuth) return
		if (data.target && data.target !== currentAuth) return
		$socketMessages = [
			...$socketMessages,
			{
				...data,
				created_at: new Date(),
				read_at: null,
			},
		]
	}

	let currentAuth: string | null = null

	const connect = async () => {
		if (conn || unavailable || !currentAuth) return
		const inbox = inboxChannel(currentAuth)
		const attempt = new RealtimeConnection({
			channels: [PRESENCE_CHANNEL, inbox],
			onStatus: (connected) => (opened = connected),
		})
		attempt.subscribe(inbox, onChatMessage)
		try {
			await attempt.open()
			conn = attempt
		} catch {
			// First open never succeeded: realtime isn't reachable from this
			// environment, so don't nag with the offline pill or retry forever.
			attempt.close()
			unavailable = true
			opened = undefined
		}
	}

	const disconnect = () => {
		conn?.close()
		conn = null
		opened = undefined
	}

	onMount(() => {
		if (!browser) return
		// Chat exists only for signed-in users (the token mint requires a
		// session); follow the auth store so login/logout flips the connection.
		unsubscribeAuth = userAuth.subscribe((auth) => {
			currentAuth = auth
			if (auth) void connect()
			else disconnect()
		})
		const updateTime = () => {
			$socketMessages = [...$socketMessages]
			$refreshTimeout = setTimeout(updateTime, 50 * 10)
		}
		updateTime()
	})

	onDestroy(() => {
		disconnect()
		if (unsubscribeAuth) unsubscribeAuth()
		if ($refreshTimeout) {
			clearTimeout($refreshTimeout)
		}
		$refreshTimeout = null
	})
</script>

{#if error}
	<div class="fixed"></div>
{:else}
	<slot {socketMessages}></slot>

	{#if opened === false}
		<div class="fixed bottom-0 group" in:fly={{ y: -20 }} out:fly={{ y: -20 }}>
			<div
				class="relative flex items-end truncate text-clip text-white text-sm font-bold px-4 py-3 transition-all delay-300 duration-700 ease-out overflow-clip w-10 group-hover:w-full"
				role="alert"
			>
				<div
					class="absolute left-2 bottom-1 w-8 h-8 bg-red-500 transition-all delay-300 duration-700 ease-out overflow-clip rounded-[20px] group-hover:rounded-[0px] group-hover:rounded-tr-2xl group-hover:left-0 group-hover:bottom-0 group-hover:w-full group-hover:h-14 sm:h-8 sm:group-hover:h-9"
					role="alert"
				></div>
				<svg
					class="relative fill-current w-4 h-4 mr-2"
					style="min-width: 16px; min-height: 16px;"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
				>
					<path
						d="M12.432 0c1.34 0 2.01.912 2.01 1.957 0 1.305-1.164 2.512-2.679 2.512-1.269 0-2.009-.75-1.974-1.99C9.789 1.436 10.67 0 12.432 0zM8.309 20c-1.058 0-1.833-.652-1.093-3.524l1.214-5.092c.211-.814.246-1.141 0-1.141-.317 0-1.689.562-2.502 1.117l-.528-.88c2.572-2.186 5.531-3.467 6.801-3.467 1.057 0 1.233 1.273.705 3.23l-1.391 5.352c-.246.945-.141 1.271.106 1.271.317 0 1.357-.392 2.379-1.207l.6.814C12.098 19.02 9.365 20 8.309 20z"
					/>
				</svg>
				<div class="flex flex-col sm:space-x-1 sm:contents translate-y-2 sm:translate-y-0">
					<p class="relative text-xs">You're offline. Your messages</p>
					<p class="relative text-xs">will be synched when you are online again.</p>
				</div>
			</div>
		</div>
	{/if}
{/if}
