<script lang="ts">
	import { onMount } from 'svelte'
	import { mountAuth, redirectAfterLogout } from './hanko'

	onMount(mountAuth)
</script>

<hanko-profile on:onUserLoggedOut={redirectAfterLogout} />
