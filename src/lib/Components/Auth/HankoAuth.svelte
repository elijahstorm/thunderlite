<script lang="ts">
	import { onMount } from 'svelte'
	import { hanko, mountAuth, redirectAfterLogin } from './hanko'

	onMount(() => {
		mountAuth()
		return hanko.onAfterStateChange((detail) => {
			if (detail.state?.name === 'success') redirectAfterLogin()
		})
	})
</script>

<hanko-auth></hanko-auth>
