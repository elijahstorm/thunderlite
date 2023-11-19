<script lang="ts">
	import { browser } from '$app/environment'
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
		import('$lib/Components/Auth/hanko').then((hanko) => (auth = hanko.userAuth))
	}
</script>

<slot />

<section
	class="fixed right-4 z-50 border-brand-200 border-b-0 rounded-t-lg overflow-clip transition-all"
	class:-bottom-96={!showChatList}
	class:bottom-0={showChatList}
	class:border={showChatList}
	class:bg-gray-200={!showChatList}
	class:bg-gray-50={showChatList}
>
	<ChatList
		highlight={!showChatList}
		on:toggle={() => (showChatList = !showChatList)}
		on:open={() => (showChatList = true)}
		on:chat={({ detail }) => openChat(detail)}
	/>
</section>

{#if chattingWith && $auth}
	<section
		class="fixed right-96 z-50 translate-y-1 max-w-[440px] w-[440px] border-brand-200 border-b-0 rounded-t-lg overflow-clip transition-all"
		class:-bottom-96={!showChat}
		class:bottom-0={showChat}
		class:border={showChat}
		class:bg-gray-200={!showChat}
		class:bg-gray-50={showChat}
	>
		{#key chattingWith}
			<ChatRoom
				source={$auth}
				target={chattingWith}
				highlight={!showChat}
				on:toggle={() => (showChat = !showChat)}
			/>
		{/key}
	</section>
{/if}
