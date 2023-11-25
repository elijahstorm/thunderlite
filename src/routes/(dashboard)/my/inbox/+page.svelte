<script lang="ts">
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import ChatList from '$lib/Components/Widgets/Social/Chat/ChatList.svelte'

	const openChat = (auth: string) => browser && goto(`/chat/${auth}`)
</script>

<section>
	<h1 class="py-4 opacity-90 text-lg font-semibold">Inbox</h1>

	<ChatList on:chat={({ detail }) => openChat(detail)} />
</section>
