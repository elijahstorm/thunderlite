<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'

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

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-3xl space-y-8">
		<header>
			<p class="section-eyebrow">Multiplayer</p>
			<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">Rooms</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Signed in as <span class="text-foreground font-medium">{data.user}</span>
			</p>
		</header>

		{#if gameData?.session}
			<section class="card p-6 sm:p-8 space-y-5">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold tracking-tight text-foreground">Your active session</h2>
					<p class="text-sm text-muted-foreground">
						Share this code with a friend so they can join your game.
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<code
						data-testid="session-code"
						class="px-3 py-2 rounded-md bg-muted text-foreground font-mono text-sm tracking-wide"
					>
						{gameData.session}
					</code>
					<button
						type="button"
						class="btn btn-outline btn-sm"
						on:click={() => gameData && copyCode(gameData.session)}
					>
						<Icon icon="lucide:copy" width={14} />
						Copy
					</button>
					<a href="/play" class="btn btn-primary btn-sm">
						<Icon icon="lucide:play" width={14} />
						Go to game
					</a>
				</div>

				<p class="text-xs text-muted-foreground">
					Map <span class="font-mono">{gameData.sha}</span>
				</p>
			</section>
		{:else}
			<section class="card p-6 sm:p-8 flex items-center justify-between gap-4 flex-wrap">
				<div>
					<h2 class="font-medium text-foreground">No active session</h2>
					<p class="text-sm text-muted-foreground mt-1">You don't have a game in progress yet.</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<a href="/editor" class="btn btn-outline">
						<Icon icon="lucide:hammer" width={14} />
						Build a map
					</a>
					<a href="/make" class="btn btn-primary">
						<Icon icon="lucide:plus" width={14} />
						Make a game
					</a>
				</div>
			</section>
		{/if}

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="space-y-1">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Join a game</h2>
				<p class="text-sm text-muted-foreground">Paste a session code shared by another player.</p>
			</div>

			<form class="flex flex-col sm:flex-row gap-2" on:submit|preventDefault={join}>
				<input
					type="text"
					bind:value={joinCode}
					placeholder="Session code"
					autocomplete="off"
					class="input flex-1 font-mono"
					disabled={joinStatus === 'sending'}
				/>
				<button type="submit" class="btn btn-primary" disabled={joinStatus === 'sending'}>
					{joinStatus === 'sending' ? 'Joining…' : 'Join'}
				</button>
			</form>

			{#if joinStatus === 'error' && joinError}
				<p
					class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{joinError}
				</p>
			{/if}
		</section>
	</div>
</ContentWithFooter>
