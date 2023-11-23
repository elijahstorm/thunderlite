<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { socketClosed, socketOpened } from './socket'
	import { writable } from 'svelte/store'
	import { PUBLIC_SOCKET_CONNECTION } from '$env/static/public'
	import { browser } from '$app/environment'
	import { fly } from 'svelte/transition'

	type SocketMessage = {
		message: string
		source: string
		target: string
	}

	const socketMessages = writable<
		(SocketMessage & {
			created_at: Date
			read_at: Date | null
		})[]
	>([])
	const connectionTimeout = writable<NodeJS.Timeout | null>()
	const refreshTimeout = writable<NodeJS.Timeout | null>()
	const TIMEOUT = 1000
	let socket = writable<WebSocket | null>(null)
	let error = false
	let opened: boolean | undefined = undefined

	const populate = (props: SocketMessage) => $socket && $socket.send(JSON.stringify(props))

	const create = () => {
		if (!browser) return null
		const socket = new WebSocket(PUBLIC_SOCKET_CONNECTION)
		socket.onopen = socketOpened(socket, () => (opened = true))
		socket.onclose = socketClosed(() => (opened = false))
		socket.onmessage = (evt: MessageEvent<string>) => {
			const data = JSON.parse(evt.data) as SocketMessage | undefined
			if (!data?.message) return
			$socketMessages = [
				...$socketMessages,
				{
					...data,
					created_at: new Date(),
					read_at: null,
				},
			]
		}
		return socket
	}

	const connect = () => {
		if (!window['WebSocket']) {
			$connectionTimeout = null
			return
		}
		if (!$socket || (typeof opened !== 'undefined' && !opened)) {
			socket.set(create())
		}
		$connectionTimeout = setTimeout(connect, TIMEOUT)
	}

	onMount(() => {
		if (!$connectionTimeout) {
			$connectionTimeout = setTimeout(connect, TIMEOUT)
		}
		const updateTime = () => {
			$socketMessages = [...$socketMessages]
			$refreshTimeout = setTimeout(updateTime, 50 * 10)
		}
		updateTime()
	})

	onDestroy(() => {
		$socket?.close()
		if ($connectionTimeout) {
			clearTimeout($connectionTimeout)
		}
		$connectionTimeout = null
		if ($refreshTimeout) {
			clearTimeout($refreshTimeout)
		}
		$refreshTimeout = null
	})
</script>

{#if error}
	<div class="fixed" />
{:else if opened}
	<slot {populate} {socketMessages} />
{:else}
	<slot {populate} {socketMessages} />

	<div class="fixed bottom-0 group" in:fly={{ y: -20 }} out:fly={{ y: -20 }}>
		<div
			class="relative flex items-end truncate text-clip text-white text-sm font-bold px-4 py-3 transition-all delay-300 duration-700 ease-out overflow-clip w-10 group-hover:w-full"
			role="alert"
		>
			<div
				class="absolute left-2 bottom-1 w-8 h-8 bg-red-500 transition-all delay-300 duration-700 ease-out overflow-clip rounded-[20px] group-hover:rounded-[0px] group-hover:rounded-tr-2xl group-hover:left-0 group-hover:bottom-0 group-hover:w-full group-hover:h-14 sm:h-8 sm:group-hover:h-9"
				role="alert"
			/>
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
