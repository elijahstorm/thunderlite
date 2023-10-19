<script lang="ts">
	export let text: string
	export let name: string
	export let id: string
	export let type: string
	export let icon: string = ""

	export let required: boolean = false
	export let attempted: boolean = false

	$: iconHref = `background: url(${icon}); background-size: 1.5rem auto; background-repeat: repeat;`
</script>

<div class="relative my-4 mx-0">
	{#if icon != ""}
		<div class="input-icon absolute -mt-2 w-6 h-6 left-3 bottom-4" style={iconHref} />
	{/if}

	<input
		class="text-sm text-black w-full rounded-lg p-4 border border-brand-500"
		class:invalid:border-red-500={attempted}
		class:pl-14={icon != ""}
		{id}
		{name}
		placeholder={text}
		{type}
		{required}
	/>
</div>

<style>
	.input-icon::after {
		content: "";
		position: absolute;
		right: -11px;
		top: -10px;
		bottom: -10px;
		width: 1px;
		opacity: 0.5;
		background-color: rgba(212, 212, 212, 0);
		background-image: -webkit-linear-gradient(
			bottom,
			rgba(212, 212, 212, 0) 0,
			#d4d4d4 30%,
			#d4d4d4 70%,
			rgba(212, 212, 212, 0) 100%
		);
		background-image: linear-gradient(
			to top,
			rgba(212, 212, 212, 0) 0,
			#d4d4d4 30%,
			#d4d4d4 70%,
			rgba(212, 212, 212, 0) 100%
		);
	}
</style>
