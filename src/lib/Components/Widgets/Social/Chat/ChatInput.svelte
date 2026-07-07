<script lang="ts">
	import { enhance } from '$app/forms'
	import { addToast } from 'as-toast'
	import { createEventDispatcher } from 'svelte'

	export let target: string
	let chatInput: HTMLInputElement

	const dispatch = createEventDispatcher()

	const send = (message: string) => dispatch('send', { message })
</script>

<form
	class="flex items-center gap-2 border-t border-border p-2"
	method="POST"
	action="/api/user/{target}/message"
	use:enhance={({ formData, cancel }) => {
		const message = formData.get('chat-input')
		if (!message) {
			cancel()
			return
		}
		send(message.toString())
		chatInput.value = ''
		return async ({ result, update }) => {
			// @ts-ignore
			if (result.status !== 'ok') {
				addToast(`Error sending the message. ${result.status}`, 'warn')
			}
			update()
		}
	}}
>
	<input
		bind:this={chatInput}
		id="chat-input"
		name="chat-input"
		type="text"
		placeholder="Write a message…"
		autocomplete="off"
		class="flex-1 rounded-full bg-muted px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
	/>
	<button
		type="submit"
		aria-label="Send"
		class="inline-flex items-center justify-center rounded-full h-9 w-9 bg-brand-500 hover:bg-brand-400 text-white transition-colors focus:outline-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-5 w-5 rotate-45"
		>
			<path
				d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
			/>
		</svg>
	</button>
</form>
