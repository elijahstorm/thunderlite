<script lang="ts">
	interface Props {
		selected?: boolean
		action: VoidFunction
		size: number
		disabled?: boolean
		title?: string | undefined
		children?: import('svelte').Snippet
	}

	let {
		selected = false,
		action,
		size,
		disabled = false,
		title = undefined,
		children,
	}: Props = $props()

	let style = $derived(`width: ${size}px; height: ${size}px;`)
</script>

<button
	type="button"
	onclick={action}
	{disabled}
	{title}
	{style}
	class="relative shrink-0 overflow-hidden rounded-lg border-2 bg-surface-2 outline-none transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
	class:border-transparent={!selected}
	class:border-primary={selected}
	class:ring-2={selected}
	class:ring-inset={selected}
	class:ring-primary={selected}
	class:shadow-md={selected}
	class:opacity-40={disabled}
	class:grayscale={disabled}
	class:pointer-events-none={disabled}
>
	{@render children?.()}
</button>
