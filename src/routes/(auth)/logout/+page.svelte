<script lang="ts">
	import HankoProfile from '$lib/Components/Auth/HankoProfile.svelte'
	import { logout } from '$lib/Components/Auth/hanko'
	import { onMount } from 'svelte'

	onMount(logout)
</script>

<HankoProfile />
