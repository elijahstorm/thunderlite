<script lang="ts">
	import { goto } from '$app/navigation'
	import ChatSocket from '$lib/Components/Socket/ChatSocket.svelte'
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'

	let { data } = $props()
</script>

<section class="mx-auto w-full max-w-2xl h-[100dvh] flex flex-col">
	<ChatSocket>
		{#snippet children({ socketMessages })}
			<ChatRoom
				{socketMessages}
				source={data.me}
				target={data.target}
				highlight
				ontoggle={() => goto('/my/inbox')}
			/>
		{/snippet}
	</ChatSocket>
</section>
