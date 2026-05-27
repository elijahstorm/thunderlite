<script lang="ts">
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import ChatList from '$lib/Components/Widgets/Social/Chat/ChatList.svelte'

	const openChat = (auth: string) => browser && goto(`/chat/${auth}`)
</script>

<section>
	<header class="mb-6">
		<p class="section-eyebrow">Messages</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">Inbox</h1>
	</header>

	<div class="card overflow-hidden">
		<ChatList on:chat={({ detail }) => openChat(detail)} />
	</div>
</section>
