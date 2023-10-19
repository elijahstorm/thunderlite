<script lang="ts">
	import { Hanko } from '@teamhanko/hanko-elements'
	import { addToast } from 'as-toast'
	import { PUBLIC_HANKO_API_URL } from '$env/static/public'

	const hanko = new Hanko(PUBLIC_HANKO_API_URL)

	const handleError = (type: string) => (error: string) => {
		addToast(`Error loading Hanko ${type}`, 'warn')
		console.error(error)
	}

	const logout = () => hanko.user.logout().catch(handleError('logout'))
</script>

<button on:click={logout}>Logout</button>
