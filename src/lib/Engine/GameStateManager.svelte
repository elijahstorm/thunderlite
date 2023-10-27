<script lang="ts">
	import type { socketSelect } from '$lib/Components/Socket/socket'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	export let gameSession: string
	export let userSession: string

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let active = false

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (state !== 'waiting') return
		if (active) return

		interactor(x, y)
	}
</script>

<slot {select} />

<div
	class="fixed text-center left-0 right-0 bottom-10 scale-150 text-4xl pointer-events-none select-none"
>
	<p>
		{gameSession} | {userSession}
	</p>
	<p>
		{state} | {active}
	</p>
</div>
