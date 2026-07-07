<script lang="ts">
	import { goto } from '$app/navigation'
	import ChatSocket from '$lib/Components/Socket/ChatSocket.svelte'
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'

	export let data
</script>

<section class="mx-auto w-full max-w-2xl h-[100dvh] flex flex-col">
	<ChatSocket let:socketMessages>
		<ChatRoom
			{socketMessages}
			source={data.me}
			target={data.target}
			highlight
			on:toggle={() => goto('/my/inbox')}
		/>
	</ChatSocket>
</section>
