<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { socketClosed, socketMessage, socketOpened } from './socket'
	import { writable } from 'svelte/store'
	import { PUBLIC_SOCKET_CONNECTION } from '$env/static/public'
	import { browser } from '$app/environment'

	export let map: () => MapObject | undefined
	let requestRedraw: number

	let socket = writable<WebSocket | null>(null)
	const connectionTimeout = writable<NodeJS.Timeout | null>()
	const TIMEOUT = 1000
	let error = false

	const create = () => {
		if (!browser) return null
		const socket = new WebSocket(PUBLIC_SOCKET_CONNECTION)
		socket.onopen = socketOpened
		socket.onclose = socketClosed
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
{:else}
	<slot socket={$socket} {requestRedraw} />
{/if}
