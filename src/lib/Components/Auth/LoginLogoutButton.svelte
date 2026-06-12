<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from './UserIcon.svelte'
	import { userAuth } from '$lib/dontcode/client'
</script>

<div class="flex items-center gap-2">
	{#if $userAuth === null}
		<a class="btn btn-primary btn-sm" href="/login">
			<span>Sign in</span>
			<Icon icon="lucide:arrow-right" width={14} />
		</a>
	{:else}
		<UserIcon auth={$userAuth} />
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
