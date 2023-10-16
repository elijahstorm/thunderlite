<script lang="ts">
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'

	// import session from "$lib/firebase/session"

	// $: {
	// 	if (!$session.waitingCreationFlow && $session.user && $session.ready) {
	// 		if (browser) goto("/")
	// 	}
	// }
</script>

<slot />
