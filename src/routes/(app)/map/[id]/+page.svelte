<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import MakeGameMapCard from '$lib/Components/Widgets/Social/MakeGameMapCard.svelte'
	import { dbUsersStore } from '$lib/Stores/dbStores'

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

	const makeGame = () => {
		status = 'sending'
		fetch('/api/game', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({ mapId: map.public_id }),
		})
			.then((response) => response.json())
			.then((session) => {
				if (!session || typeof session === 'string' || typeof session?.session !== 'string') {
					throw { message: session?.message ?? session ?? 'Could not create game session' }
				}
				if (!browser) return
				// Land in the pre-game lobby, not the match — this gives an opponent a
				// window to join with the room code before play begins.
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

			{#if status === 'error'}
				<p
					class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{errorMessage}
				</p>
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
		</section>
	</div>
</ContentWithFooter>
