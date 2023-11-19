<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { socketClosed, socketMessage, socketOpened } from './socket'
	import { writable } from 'svelte/store'
	import { PUBLIC_SOCKET_CONNECTION } from '$env/static/public'
	import { browser } from '$app/environment'
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import { fly } from 'svelte/transition'

	export let map: () => MapObject | undefined

	const connectionTimeout = writable<NodeJS.Timeout | null>()
	const TIMEOUT = 1000
	let socket = writable<WebSocket | null>(null)
	let requestRedraw: number
	let error = false
	let opened = false

	const create = () => {
		if (!browser) return null
		const socket = new WebSocket(PUBLIC_SOCKET_CONNECTION)
		socket.onopen = socketOpened(() => (opened = true))
		socket.onclose = socketClosed(() => (opened = false))
		socket.onmessage = socketMessage(map, (now: number) => (requestRedraw = now))
		return socket
	}

	const connect = () => {
		if (!window['WebSocket']) {
			$connectionTimeout = null
			return
		}
		if (!$socket) {
			socket.set(create())
		}
		$connectionTimeout = setTimeout(connect, TIMEOUT)
	}

	onMount(() => {
		if (!$connectionTimeout) {
			$connectionTimeout = setTimeout(connect, TIMEOUT)
		}
	})

	onDestroy(() => {
		$socket?.close()
		if ($connectionTimeout) {
			clearTimeout($connectionTimeout)
		}
		$connectionTimeout = null
	})
</script>

{#if error}
	Your broswer does not support WebSockets.
{:else if opened}
	<slot socket={$socket} {requestRedraw} />
{:else}
	<LocalInteracter {map} let:socket let:requestRedraw>
		<slot {socket} {requestRedraw} />
	</LocalInteracter>

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
				<p class="relative text-xs">You're offline. Moves you make will</p>
				<p class="relative text-xs">be synched when you are online again.</p>
			</div>
		</div>
	</div>
{/if}
