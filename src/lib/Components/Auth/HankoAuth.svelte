<script lang="ts">
	import { onMount } from 'svelte'
	import { mountAuth, redirectAfterLogin } from './hanko'

	onMount(mountAuth)
</script>

<hanko-auth on:onAuthFlowCompleted={redirectAfterLogin} />
