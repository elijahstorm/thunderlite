<script lang="ts">
	import { browser } from '$app/environment'
	import ChatSocket from '$lib/Components/Socket/ChatSocket.svelte'
	import ChatList from '$lib/Components/Widgets/Social/Chat/ChatList.svelte'
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'
	import { writable } from 'svelte/store'

	let auth = writable<string | null>(null)

	let showChatList = false
	let showChat = false
	let chattingWith: string | null = null

	const openChat = (auth: string) => {
		chattingWith = auth
		showChat = true
	}

	if (browser) {
		import('$lib/Components/Auth/session').then((hanko) => (auth = hanko.userAuth))
	}
</script>

<slot></slot>

<ChatSocket let:populate let:socketMessages>
	<section
		class="fixed sm:block right-4 z-50 rounded-t-xl overflow-clip transition-all border border-border border-b-0 bg-surface shadow-lg"
		class:-bottom-96={!showChatList}
		class:bottom-0={showChatList}
		class:hidden={showChat}
	>
		<ChatList
			{socketMessages}
			highlight={!showChatList}
			on:toggle={() => (showChatList = !showChatList)}
			on:open={() => (showChatList = true)}
			on:chat={({ detail }) => openChat(detail)}
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
					{populate}
					{socketMessages}
					source={$auth}
					target={chattingWith}
					highlight={!showChat}
					on:toggle={() => (showChat = !showChat)}
				/>
			{/key}
		</section>
	{/if}
</ChatSocket>
