<script lang="ts">
	import { browser } from '$app/environment'
	import ChatSocket from '$lib/Components/Socket/ChatSocket.svelte'
	import ChatList from '$lib/Components/Widgets/Social/Chat/ChatList.svelte'
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'
	import { openDmWith } from '$lib/Stores/openDm'
	import { onDestroy } from 'svelte'
	import { writable } from 'svelte/store'
	interface Props {
		children?: import('svelte').Snippet
	}

	let { children }: Props = $props()

	let auth = $state(writable<string | null>(null))

	let showChatList = $state(false)
	let showChat = $state(false)
	let chattingWith: string | null = $state(null)

	const openChat = (auth: string) => {
		chattingWith = auth
		showChat = true
	}

	// Any descendant (game roster, group chat, profile) can request a DM by
	// setting the shared store; we pop it open and clear the request.
	const stopDmRequests = openDmWith.subscribe((target) => {
		if (target) {
			openChat(target)
			openDmWith.set(null)
		}
	})
	onDestroy(stopDmRequests)

	if (browser) {
		import('$lib/dontcode/client').then((session) => (auth = session.userAuth))
	}
</script>

{@render children?.()}

<ChatSocket>
	{#snippet children({ socketMessages })}
		<section
			class="fixed sm:block right-4 z-50 rounded-t-xl overflow-clip transition-all border border-border border-b-0 bg-surface shadow-lg"
			class:-bottom-96={!showChatList}
			class:bottom-0={showChatList}
			class:hidden={showChat}
		>
			<ChatList
				{socketMessages}
				highlight={!showChatList}
				ontoggle={() => (showChatList = !showChatList)}
				onchat={(auth) => openChat(auth)}
			/>
		</section>

		{#if chattingWith && $auth}
			<section
				class="fixed sm:right-96 z-50 translate-y-1 w-full max-w-full sm:max-w-[440px] sm:w-[440px] rounded-t-xl overflow-clip transition-all border border-border border-b-0 bg-surface shadow-lg"
				class:hidden={!showChat}
				class:sm:block={!showChat}
				class:sm:-bottom-96={!showChat}
				class:bottom-0={showChat}
				class:sm:right-4={showChat}
				class:right-0={showChat}
			>
				{#key chattingWith}
					<ChatRoom
						{socketMessages}
						source={$auth}
						target={chattingWith}
						highlight={!showChat}
						ontoggle={() => (showChat = !showChat)}
					/>
				{/key}
			</section>
		{/if}
	{/snippet}
</ChatSocket>
