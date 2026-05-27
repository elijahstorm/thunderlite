<script lang="ts">
	export let selected: boolean = false
	export let action: VoidFunction
	export let size: number
	export let disabled = false
	export let title: string | undefined = undefined

	$: style = `width: ${size}px; height: ${size}px;`
</script>

<button
	type="button"
	on:click={action}
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
	<slot></slot>
</button>
