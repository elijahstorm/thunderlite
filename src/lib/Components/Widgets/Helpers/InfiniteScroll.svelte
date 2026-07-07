<script lang="ts">
	import type { UIEventHandler } from 'svelte/elements'

	interface Props {
		tailwind?: string
		threshold?: number
		horizontal?: boolean
		reverse?: boolean
		onload?: () => void
		children?: import('svelte').Snippet
	}

	let {
		tailwind = '',
		threshold = 0,
		horizontal = false,
		reverse = false,
		onload,
		children,
	}: Props = $props()

	let isLoadMore = false
	let component = $state<HTMLDivElement>()

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
				onload?.()
			}
			isLoadMore = true
		} else {
			isLoadMore = false
		}
	}
</script>

<div bind:this={component} class="overflow-auto {tailwind}" onscroll={scroll} onresize={scroll}>
	{@render children?.()}
</div>
