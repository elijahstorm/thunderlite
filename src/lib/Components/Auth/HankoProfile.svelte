<!--
	Account panel. Kept under its old name because call sites outside the auth
	migration's ownership (e.g. /me) still import HankoProfile — Hanko itself
	is gone; this now talks to the DontCode session endpoints.
-->
<script lang="ts">
	import { onMount } from 'svelte'
	import { logout, redirectAfterLogout, refreshSession } from './session'

	let email: string | null = null
	let loaded = false

	onMount(async () => {
		const user = await refreshSession()
		email = user?.email ?? null
		loaded = true
	})

	const signOut = () => logout().then(redirectAfterLogout)
</script>

<div class="card p-6 space-y-4">
	<div class="space-y-1">
		<p class="field-label">Account</p>
		<p class="text-sm text-muted-foreground">
			{#if !loaded}
				Loading…
			{:else}
				{email ?? 'Signed in'}
			{/if}
		</p>
	</div>

	<button class="btn btn-outline btn-sm" type="button" on:click={signOut}> Sign out </button>
</div>
