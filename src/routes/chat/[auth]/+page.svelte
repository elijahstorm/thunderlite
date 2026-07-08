<script lang="ts">
	import { goto } from '$app/navigation'
	import PoweredByDontCode from '$lib/Components/Branding/PoweredByDontCode.svelte'
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

	<div class="flex justify-center py-2">
		<PoweredByDontCode variant="inline" />
	</div>
</section>
