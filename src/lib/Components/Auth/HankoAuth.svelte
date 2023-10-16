<script lang="ts">
	import { onMount } from 'svelte'
	import { register } from '@teamhanko/hanko-elements'
	import { addToast } from 'as-toast'
	import { goto } from '$app/navigation'
	import { PUBLIC_HANKO_API_URL } from '$env/static/public'

	const redirectAfterLogin = () => {
		console.log('success')
		goto('/me')
	}

	onMount(async () => {
		register(PUBLIC_HANKO_API_URL).catch((error) => {
			addToast('Error loading Hanko', 'warn')
			console.error(error)
		})
	})
</script>

<hanko-auth on:onAuthFlowCompleted={redirectAfterLogin} />
