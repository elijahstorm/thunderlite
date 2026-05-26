<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'

	export let data: PageData

	$: gameData = data.gameData
	let joinCode = ''
	let joinStatus: 'idle' | 'sending' | 'error' = 'idle'
	let joinError = ''

	const join = async () => {
		const session = joinCode.trim()
		if (!session) {
			joinStatus = 'error'
			joinError = 'Please enter a session code'
			return
		}
		joinStatus = 'sending'
		joinError = ''
		try {
			const response = await fetch('/api/game/join', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-sveltekit-action': 'true',
				},
				body: JSON.stringify({ session }),
			})
			const body = await response.json().catch(() => null)
			if (!response.ok) {
				throw new Error(body?.message ?? 'Could not join game session')
			}
			if (browser) {
				goto('/play')
				return
			}
			joinStatus = 'idle'
		} catch (err) {
			joinStatus = 'error'
			joinError = err instanceof Error ? err.message : 'Could not join game session'
		}
	}

	const copyCode = async (code: string) => {
		if (!browser || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(code)
		} catch {
			// ignore — clipboard may be denied
		}
	}
</script>

<section class="h-screen overflow-y-auto p-6 space-y-8">
	<header>
		<h1 class="text-2xl font-semibold">Rooms</h1>
		<p class="text-sm text-gray-500">Signed in as {data.user}</p>
	</header>

	{#if gameData?.session}
		<div class="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800">
			<h2 class="text-lg font-medium">Your active session</h2>
			<p class="text-sm text-gray-600 dark:text-gray-300">
				Share this code with a friend so they can join your game:
			</p>
			<div class="flex items-center gap-3">
				<code
					data-testid="session-code"
					class="px-3 py-2 rounded bg-gray-100 dark:bg-gray-900 font-mono text-base"
				>
					{gameData.session}
				</code>
				<button
					type="button"
					class="btn btn-gray text-xs"
					on:click={() => gameData && copyCode(gameData.session)}
				>
					Copy
				</button>
				<a href="/play" class="btn btn-primary text-xs">Go to game</a>
			</div>
			<p class="text-xs text-gray-500">Map: {gameData.sha}</p>
		</div>
	{:else}
		<div class="border rounded-lg p-4 bg-white dark:bg-gray-800">
			<p class="text-sm text-gray-600 dark:text-gray-300">
				You have no active session. <a class="text-blue-600 underline" href="/make">Make a game</a>
				to start one.
			</p>
		</div>
	{/if}

	<div class="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800">
		<h2 class="text-lg font-medium">Join a game</h2>
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Paste a session code shared by another player:
		</p>
		<form class="flex flex-col sm:flex-row gap-2" on:submit|preventDefault={join}>
			<input
				type="text"
				bind:value={joinCode}
				placeholder="Session code"
				autocomplete="off"
				class="flex-1 px-3 py-2 rounded border bg-white dark:bg-gray-900 font-mono"
				disabled={joinStatus === 'sending'}
			/>
			<button type="submit" class="btn btn-primary" disabled={joinStatus === 'sending'}>
				{joinStatus === 'sending' ? 'Joining…' : 'Join'}
			</button>
		</form>
		{#if joinStatus === 'error' && joinError}
			<p class="text-red-500 block p-3 w-full text-sm bg-red-50 rounded-lg border border-red-300">
				{joinError}
			</p>
		{/if}
	</div>
</section>
