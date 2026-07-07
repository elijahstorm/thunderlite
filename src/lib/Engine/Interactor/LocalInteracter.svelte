<script lang="ts">
	import { socketMessage } from '$lib/Components/Socket/socket'

	interface Props {
		map: () => MapObject | undefined
		children?: import('svelte').Snippet<[any]>
	}

	let { map, children }: Props = $props()
	let requestRedraw = $state(0)

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

{@render children?.({ socket, requestRedraw })}
