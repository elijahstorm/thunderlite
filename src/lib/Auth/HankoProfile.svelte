<script lang="ts">
	import { register, Hanko } from '@teamhanko/hanko-elements'
	import { HANKO_API_URL } from '$env/static/private'
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { addToast } from 'as-toast'

	const hanko = new Hanko(HANKO_API_URL)

	const handleError = (type: string) => (error: string) => {
		addToast(`Error loading Hanko ${type}`, 'warn')
		console.error(error)
	}

	const logout = () => hanko.user.logout().catch(handleError('logout'))

	const redirectAfterLogout = () => goto('/login')

	onMount(() => register(HANKO_API_URL).catch(handleError('register')))
</script>

<button on:click={logout}>Logout</button>
<hanko-profile on:onUserLoggedOut={redirectAfterLogout} />
