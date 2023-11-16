<script lang="ts">
	import ChatRoom from '$lib/Components/Widgets/Social/Chat/ChatRoom.svelte'
	import type { PageData } from './$types'

	export let data: PageData
	$: source = data.source
	$: target = data.target
</script>

<ChatRoom {source} {target} />
