<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from './UserIcon.svelte'
	import { browser } from '$app/environment'
	import { writable } from 'svelte/store'

	let auth = writable<string | null>(null)

	if (browser) {
		import('./hanko').then((hanko) => (auth = hanko.userAuth))
	}
</script>

<div class="flex items-center gap-2">
	{#if $auth === null}
		<a class="btn btn-primary btn-sm" href="/login">
			<span>Sign in</span>
			<Icon icon="lucide:arrow-right" width={14} />
		</a>
	{:else if typeof $auth === 'string'}
		<UserIcon auth={$auth} />
		<a
			href="/logout"
			class="btn btn-ghost btn-sm text-muted-foreground hover:text-foreground"
			aria-label="Log out"
		>
			<Icon icon="lucide:log-out" width={16} />
			<span class="hidden sm:inline">Log out</span>
		</a>
	{/if}
</div>
