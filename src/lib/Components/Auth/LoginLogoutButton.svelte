<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from './UserIcon.svelte'
	import { browser } from '$app/environment'
	import { writable } from 'svelte/store'

	let auth = writable<string | null>(null)

	if (browser) {
		import('./hanko').then((hanko) => {
			auth = hanko.userID
			console.log('hello', $auth)
		})
	}
</script>

<section class="m-auto flex justify-center items-center gap-4">
	{#if $auth === null}
		<a class="btn btn-primary flex items-center content-center h-max" href="/login">
			<span class="pl-2 pr-4"> Login </span>
			<Icon icon={'fe:login'} width={16} />
		</a>
	{:else if typeof $auth === 'string'}
		<UserIcon id={$auth} />
		<a href="/logout" class="btn btn-gray text-xs px-2 py-2 flex items-center h-max my-auto">
			<span class="px-2 hidden sm:block"> Logout </span>
			<Icon icon={'fe:logout'} width={16} />
		</a>
	{/if}
</section>
