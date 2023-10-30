<script lang="ts">
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import { Card } from 'flowbite-svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'

	let sha: string = 'bad'
	let postStatus: 'idle' | 'sending' | 'error' | 'success' | 'no-nav' = 'idle'
	let postResponse: {
		message: string
	}

	const make = () => {
		postStatus = 'sending'
		fetch('/api/game', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({
				sha,
			}),
		})
			.then((data) => data.json())
			.then((session) => {
				if (!session || typeof session === 'string' || typeof session?.session !== 'string') {
					throw { message: session?.message ?? session ?? 'Could not create game session' }
				}
				if (!browser) {
					postStatus = 'no-nav'
					return
				}
				postStatus = 'success'
				goto('/play')
			})
			.catch((reason) => {
				postStatus = 'error'
				postResponse = { message: reason.message }
			})
	}
</script>

<Card>
	{#if postStatus === 'error'}
		<p
			class="text-red-500 block p-3 mb-4 w-full text-sm bg-red-50 rounded-lg border border-red-300 shadow-sm"
		>
			{postResponse.message}
		</p>
	{:else if postStatus === 'no-nav'}
		<p>
			<span> Game created. </span>

			<a
				href="/play"
				class="border-transparent border-b-2 text-blue-600 transition-colors hover:border-blue-600 focus:border-blue-600"
			>
				Click here to play
			</a>
		</p>
	{:else if postStatus === 'success'}
		<p>Game created. You will be redirected in a few seconds...</p>
	{:else if postStatus === 'sending'}
		<Loader />
	{:else}
		<button on:click={make}> make </button>
	{/if}
</Card>
