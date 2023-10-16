<script lang="ts">
	import { register, Hanko } from '@teamhanko/hanko-elements'
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { addToast } from 'as-toast'
	import { PUBLIC_HANKO_API_URL } from '$env/static/public'

	const hanko = new Hanko(PUBLIC_HANKO_API_URL)

	const handleError = (type: string) => (error: string) => {
		addToast(`Error loading Hanko ${type}`, 'warn')
		console.error(error)
	}

	const redirectAfterLogout = () => goto('/login')

	onMount(() => register(PUBLIC_HANKO_API_URL).catch(handleError('register')))
</script>

<hanko-profile on:onUserLoggedOut={redirectAfterLogout} />
