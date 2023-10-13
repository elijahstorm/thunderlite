<script lang="ts">
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import Icon from '@iconify/svelte'

	const signOut = () => {}

	let loggedIn = false
	// let loggedIn: UserInfo
	// $: loggedIn = $session.user
</script>

<section class="m-auto flex justify-center gap-4">
	{#if loggedIn}
		<UserIcon />
		<button
			class="btn btn-primary text-xs px-2 py-2 flex items-center h-max"
			on:click={() => signOut()}
		>
			<span class="px-2 hidden sm:block">Logout</span>
			<Icon icon={'fe:logout'} width={16} />
		</button>
	{:else}
		<a class="flex items-center content-center h-max btn btn-primary" href="/login">
			<span class="pr-2">Login</span>
			<Icon icon={'akar-icons:google-fill'} width={22} />
		</a>
	{/if}
</section>
