<script lang="ts">
	import { onMount } from 'svelte'

	interface Props {
		value: string
	}

	let { value = $bindable() }: Props = $props()

	let textarea = $state<HTMLTextAreaElement>()

	onMount(() => {
		if (!textarea) return
		textarea.select()
		textarea.setSelectionRange(0, 99999)
		navigator.clipboard.writeText(textarea.value)
	})
</script>

<textarea class="hidden" bind:value bind:this={textarea}></textarea>
