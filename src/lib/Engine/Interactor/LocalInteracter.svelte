<script lang="ts">
	import { socketMessage } from '$lib/Components/Socket/socket'

	export let map: () => MapObject | undefined
	let requestRedraw: number

	let socket = {
		send: (data: string) =>
			socketMessage(
				map,
				(now: number) => (requestRedraw = now)
			)({
				data,
			} as MessageEvent),
	} as WebSocket
</script>

<slot {socket} {requestRedraw} />
