<script lang="ts">
	import { createEventDispatcher } from 'svelte'
	import type { UIEventHandler } from 'svelte/elements'

	export let tailwind = ''
	export let threshold = 0
	export let horizontal = false
	export let reverse = false

	const dispatch = createEventDispatcher()
	let isLoadMore = false
	let component: HTMLDivElement

	const scroll: UIEventHandler<HTMLDivElement> = (e) => {
		if (!e || !e.target) return

		// @ts-ignore
		const { scrollWidth, clientWidth, scrollLeft, scrollHeight, clientHeight, scrollTop } = e.target

		const offset = reverse
			? horizontal
				? scrollWidth - clientWidth + scrollLeft
				: scrollHeight - clientHeight + scrollTop
			: horizontal
			? scrollWidth - clientWidth - scrollLeft
			: scrollHeight - clientHeight - scrollTop

		if (offset <= threshold) {
			if (!isLoadMore) {
				dispatch('load')
			}
			isLoadMore = true
		} else {
			isLoadMore = false
		}
	}
</script>

<div bind:this={component} class="overflow-auto {tailwind}" on:scroll={scroll} on:resize={scroll}>
	<slot />
</div>
