<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from './UserIcon.svelte'
	import { writable } from 'svelte/store'
	import { browser } from '$app/environment'

	let auth = writable(false)

	if (browser) {
		import('./hanko').then((hanko) => (auth = hanko.loggedIn))
	}
</script>

<section class="m-auto flex justify-center items-center gap-4">
	{#if $auth}
		<UserIcon />
		<a href="/logout" class="btn btn-gray text-xs px-2 py-2 flex items-center h-max my-auto">
			<span class="px-2 hidden sm:block"> Logout </span>
			<Icon icon={'fe:logout'} width={16} />
		</a>
	{:else}
		<a class="btn btn-primary flex items-center content-center h-max" href="/login">
			<span class="pl-2 pr-4"> Login </span>
			<Icon icon={'fe:login'} width={16} />
		</a>
	{/if}
</section>
