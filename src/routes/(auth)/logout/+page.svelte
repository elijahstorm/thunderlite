<script lang="ts">
	import { onMount } from 'svelte'
	import { logout, redirectAfterLogout } from '$lib/Components/Auth/session'

	onMount(() => {
		logout().then(redirectAfterLogout)
	})
</script>

<div class="space-y-2 text-center">
	<p class="text-lg font-medium">Signing you out…</p>
	<p class="text-sm text-muted-foreground">You'll be back at the login page in a moment.</p>
</div>
