<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import Icon from '@iconify/svelte'
	import MakeGameMapCard from '$lib/Components/Widgets/Social/MakeGameMapCard.svelte'
	import { dbMapsStore, dbUsersStore } from '$lib/Stores/dbStores'
	import InfiniteScroll from '$lib/Components/Widgets/Helpers/InfiniteScroll.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import SearchWithTypes from '$lib/Components/Widgets/Forms/SearchWithTypes.svelte'

	export let data: PageData
	$: maps = data.maps
	$: users = data.users
	$: mapTypes = data.mapTypes

	let loader = () => {}
	let hasMore = true

	const createLoader: (
		props: { detail: { search: string; type: string } },
		load?: boolean
	) => void = ({ detail }, load = true) => {
		const { search, type } = detail
		let page = -1
		hasMore = true
		loader = () =>
			!selectedMap &&
			hasMore &&
			fetch(
				`/api/maps?${new URLSearchParams({
					search: search,
					type: type,
					page: `${++page}`,
				})}`
			)
				.then((response) => response.json())
				.then((data) => {
					if (data.message) {
						console.error(data.message)
						return
					}
					if (data.users) {
						dbUsersStore.update(updateStore(data.users, 'auth'))
						users = [
							...users,
							...data.users.map((user: UserDBData) => ({
								...user,
								created_at: new Date(user.created_at),
							})),
						]
					}
					if (search || type) {
						maps = []
					}
					if (data.maps) {
						dbMapsStore.update(updateStore(data.maps))
						maps = [
							...maps,
							...data.maps.map((map: MapDBData) => ({
								...map,
								created_at: new Date(map.created_at),
								updated_at: new Date(map.updated_at),
							})),
						]
						if (data.maps.length < 10) {
							hasMore = false
						}
					} else {
						hasMore = false
					}
				})
				.catch((reason) => console.error(reason))

		if (load) {
			loader()
		}
	}

	createLoader({ detail: { search: '', type: '' } }, false)

	let selectedMap: MapDBData | null = null
	let postStatus: 'idle' | 'sending' | 'error' | 'success' | 'no-nav' = 'idle'
	let postResponse: {
		message: string
	}

	const make = () => {
		if (!selectedMap) return
		postStatus = 'sending'
		fetch('/api/game', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({
				sha: selectedMap.sha,
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

	const updateStore =
		<T extends object>(data: T[], key = 'id') =>
		(store: { [key: string]: T }) =>
			data?.reduce((store, value) => {
				if (!value) return store
				// @ts-ignore
				store[value[key]] = value
				return store
			}, store) ?? store

	$: {
		dbUsersStore.update(updateStore(users, 'auth'))
		dbMapsStore.update(updateStore(maps))
	}
</script>

<InfiniteScroll tailwind="max-h-screen h-screen" threshold={600} on:load={loader}>
	<ContentWithFooter noFooterOnMobile>
		<Header />

		<div class="container py-8">
			{#if selectedMap}
				<section class="max-w-3xl mx-auto card p-6 sm:p-8">
					{#if postStatus === 'idle' || postStatus === 'error'}
						<div class="space-y-6">
							<header>
								<p class="section-eyebrow">Confirm</p>
								<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
									Start a game with this map?
								</h1>
							</header>

							<MakeGameMapCard map={selectedMap} />

							{#if postStatus === 'error'}
								<p
									class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
								>
									<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
									{postResponse.message}
								</p>
							{/if}

							<div class="flex justify-end gap-2 pt-2">
								<button class="btn btn-ghost" on:click={() => (selectedMap = null)}>
									Cancel
								</button>
								<button class="btn btn-primary" on:click={make}>
									<Icon icon="lucide:rocket" width={14} />
									Make game
								</button>
							</div>
						</div>
					{:else if postStatus === 'no-nav'}
						<div class="space-y-3 text-center py-6">
							<p class="text-foreground">Game created.</p>
							<a href="/play" class="btn btn-primary">Click here to play</a>
						</div>
					{:else if postStatus === 'success'}
						<div class="space-y-2 text-center py-6">
							<p class="text-foreground font-medium">Game created.</p>
							<p class="text-sm text-muted-foreground">
								Redirecting you to the match in a few seconds…
							</p>
						</div>
					{:else if postStatus === 'sending'}
						<Loader label="Creating session" />
					{/if}
				</section>
			{:else}
				<div class="space-y-8">
					<header class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="section-eyebrow">Maps</p>
							<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">
								Browse community maps
							</h1>
							<p class="text-sm text-muted-foreground mt-1">
								Pick a map to start a new game with, or build your own.
							</p>
						</div>
						<a href="/editor" class="btn btn-outline">
							<Icon icon="lucide:hammer" width={14} />
							Create a map
						</a>
					</header>

					<SearchWithTypes on:load={createLoader} types={mapTypes} />

					<div class="grid gap-5">
						{#each maps as map}
							<button
								class="block w-full text-left rounded-xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-0.5"
								on:click={() => (selectedMap = map)}
							>
								<MapCard {map} />
							</button>
						{/each}
					</div>

					{#if !maps?.length}
						<div class="card p-10 text-center text-sm text-muted-foreground">
							No maps matched your search. Try broadening your filters.
						</div>
					{:else if !hasMore}
						<div class="card p-6 text-center text-sm text-muted-foreground border-dashed">
							You've reached the end of the list. Pick a map and get into a game.
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</ContentWithFooter>
</InfiniteScroll>
