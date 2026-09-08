<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import MakeGameMapCard from '$lib/Components/Widgets/Social/MakeGameMapCard.svelte'
	import InviteLink from '$lib/Components/Games/InviteLink.svelte'
	import { dbUsersStore } from '$lib/Stores/dbStores'
	import {
		ASYNC_TURN_TIMEOUT_DEFAULT_MS,
		ASYNC_TURN_TIMEOUT_PRESETS,
		formatTurnTimeout,
		type GameMode,
	} from '$lib/Game/asyncConfig'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
	let map = $derived(data.map)

	// MakeGameMapCard reads the owner out of the shared user store, so seed it with
	// the owner the loader resolved (otherwise the avatar/name render blank).
	$effect(() => {
		dbUsersStore.update((store) => ({ ...store, [data.owner.auth]: data.owner }))
	})

	let status: 'idle' | 'sending' | 'error' = $state('idle')
	let errorMessage = $state('')

	// Host-chosen game format: live plays out in one websocket sitting; async
	// spreads turns over days, each with the per-turn clock picked here.
	let gameMode: GameMode = $state('live')
	let turnTimeoutMs = $state(ASYNC_TURN_TIMEOUT_DEFAULT_MS)

	// An async room that has been created and is waiting for an opponent. Held
	// here rather than navigated to: a correspondence host has nothing to do in a
	// lobby, so the useful next screen is the invite itself.
	let createdAsync: string | null = $state(null)

	const makeGame = () => {
		status = 'sending'
		fetch('/api/game', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({
				mapId: map.public_id,
				mode: gameMode,
				turnTimeoutMs: gameMode === 'async' ? turnTimeoutMs : undefined,
			}),
		})
			.then((response) => response.json())
			.then((session) => {
				if (!session || typeof session === 'string' || typeof session?.session !== 'string') {
					throw { message: session?.message ?? session ?? 'Could not create game session' }
				}
				if (!browser) return
				if (gameMode === 'async') {
					// Create-and-forget: hand over the invite and let them go. Sitting a
					// correspondence host in a lobby they are meant to walk away from was
					// the single most confusing step in the old flow.
					createdAsync = session.session
					status = 'idle'
					return
				}
				// Live: land in the pre-game lobby, where both players ready up and the
				// start countdown plays out.
				goto(`/rooms/${session.session}`)
			})
			.catch((reason) => {
				status = 'error'
				errorMessage = reason.message
			})
	}
</script>

<ContentWithFooter>
	<Header />

	<div class="container py-8">
		<section class="max-w-3xl mx-auto card p-6 sm:p-8 space-y-6">
			<header>
				<p class="section-eyebrow">Shared map</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
					{map.name ?? 'Unnamed map'}
				</h1>
			</header>

			<MakeGameMapCard {map} />

			{#if createdAsync}
				<!-- Create-and-forget confirmation. This IS the next step for an async
				     host: there is no lobby to sit in, only an invite to send. -->
				<div class="space-y-5" data-testid="async-created">
					<div class="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
						<Icon icon="lucide:check-circle-2" width={20} class="mt-0.5 shrink-0 text-primary" />
						<div>
							<p class="text-sm font-semibold text-foreground">Your async game is waiting</p>
							<p class="mt-0.5 text-sm text-muted-foreground">
								{formatTurnTimeout(turnTimeoutMs)} per turn. It starts the moment someone joins, and we
								will email you when it is your move. Nothing to keep open.
							</p>
						</div>
					</div>

					<InviteLink session={createdAsync} label="Send this to your opponent" />

					<div class="flex flex-wrap justify-end gap-2">
						<a href="/make" class="btn btn-ghost">
							<Icon icon="lucide:map" width={14} />
							Browse more maps
						</a>
						<a href="/games" class="btn btn-primary">
							<Icon icon="lucide:hourglass" width={14} />
							Your games
						</a>
					</div>
				</div>
			{:else}
				{#if status === 'error'}
					<p
						class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
					>
						<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
						{errorMessage}
					</p>
				{/if}

				{#if data.signedIn && status !== 'sending'}
					<fieldset class="space-y-3">
						<legend class="text-sm font-medium text-foreground">Game type</legend>
						<div class="grid sm:grid-cols-2 gap-2" data-testid="game-mode-picker">
							<label
								class="flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors {gameMode ===
								'live'
									? 'border-primary bg-primary/5'
									: 'border-border hover:bg-muted/50'}"
							>
								<input type="radio" class="mt-1" bind:group={gameMode} value="live" />
								<span>
									<span class="flex items-center gap-1.5 text-sm font-medium text-foreground">
										<Icon icon="lucide:zap" width={14} />
										Live
									</span>
									<span class="block text-xs text-muted-foreground mt-0.5">
										Play in one sitting. Both players stay online.
									</span>
								</span>
							</label>
							<label
								class="flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors {gameMode ===
								'async'
									? 'border-primary bg-primary/5'
									: 'border-border hover:bg-muted/50'}"
							>
								<input type="radio" class="mt-1" bind:group={gameMode} value="async" />
								<span>
									<span class="flex items-center gap-1.5 text-sm font-medium text-foreground">
										<Icon icon="lucide:hourglass" width={14} />
										Async
									</span>
									<span class="block text-xs text-muted-foreground mt-0.5">
										Take turns over days. You get an email when it is your move.
									</span>
								</span>
							</label>
						</div>

						{#if gameMode === 'async'}
							<label class="flex flex-wrap items-center gap-2 text-sm text-foreground">
								Time per turn
								<select class="input w-auto" bind:value={turnTimeoutMs} data-testid="turn-timeout">
									{#each ASYNC_TURN_TIMEOUT_PRESETS as preset (preset.ms)}
										<option value={preset.ms}>{preset.label}</option>
									{/each}
								</select>
							</label>
							<p class="text-xs text-muted-foreground">
								A player who does not finish their turn in time is resigned automatically.
							</p>
						{/if}
					</fieldset>
				{/if}

				{#if status === 'sending'}
					<Loader label="Creating session" />
				{:else}
					<div class="flex flex-wrap justify-end gap-2 pt-2">
						{#if data.isOwner}
							<a href="/editor/{map.public_id}" class="btn btn-ghost">
								<Icon icon="fluent:edit-24-filled" width={14} />
								Open in editor
							</a>
						{/if}
						{#if data.signedIn}
							<button class="btn btn-primary" onclick={makeGame}>
								<Icon icon="lucide:rocket" width={14} />
								Make game
							</button>
						{:else}
							<a href="/login" class="btn btn-primary">
								<Icon icon="lucide:log-in" width={14} />
								Sign in to play
							</a>
						{/if}
					</div>
				{/if}
			{/if}
		</section>
	</div>
</ContentWithFooter>
