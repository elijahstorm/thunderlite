<script lang="ts">
	import { onMount } from 'svelte'

	export let value: string

	let textarea: HTMLTextAreaElement

	onMount(() => {
		textarea.select()
		textarea.setSelectionRange(0, 99999)
		navigator.clipboard.writeText(textarea.value)
	})
</script>

<textarea class="hidden" bind:value bind:this={textarea} />
