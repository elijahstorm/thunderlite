<script lang="ts">
	import { goto } from '$app/navigation'
	import Header from '$lib/Components/Branding/Header.svelte'
	import PoweredByDontCode from '$lib/Components/Branding/PoweredByDontCode.svelte'
	import ChatSocket from '$lib/Components/Socket/ChatSocket.svelte'
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'

	let { data } = $props()
</script>

<!--
	A conversation fills the viewport rather than sitting in the usual
	ContentWithFooter shell: the transcript needs to own the leftover height, and
	a full site footer underneath would put the composer behind a page scroll.
	The header still ships so a reader can leave for the rest of the site, and
	`min-h-0` on every link of the flex chain is what lets the transcript scroll
	instead of pushing the composer off screen.
-->
<div class="flex h-[100dvh] flex-col bg-background">
	<Header />

	<section class="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col sm:px-4 sm:pt-4">
		<div
			class="flex min-h-0 flex-1 flex-col overflow-clip sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:shadow-sm"
		>
			<ChatSocket>
				{#snippet children({ socketMessages })}
					<ChatRoom
						{socketMessages}
						source={data.me}
						target={data.target}
						highlight
						fill
						ontoggle={() => goto('/my/inbox')}
					/>
				{/snippet}
			</ChatSocket>
		</div>
	</section>

	<div class="flex justify-center py-2">
		<PoweredByDontCode variant="inline" />
	</div>
</div>
