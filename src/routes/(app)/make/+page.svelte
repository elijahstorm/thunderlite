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

		<div class="md:container w-full break break-word">
			<section class="pt-6 pb-16 px-5 mx-auto sm:px-8 md:px-0 sm:max-w-[640px] md:max-w-none">
				{#if selectedMap}
					<div class="m-auto">
						<div
							class="p-8 border text-card-foreground bg-white dark:bg-gray-800 rounded-xl shadow-md"
						>
							{#if postStatus === 'idle' || postStatus === 'error'}
								<div class="w-full flex flex-col">
									<p>Make a game with this map?</p>
									<div class="p-6 pb-0">
										<MakeGameMapCard map={selectedMap} />
									</div>
									<div class="w-full flex gap-3 justify-end">
										<button
											class="btn btn-gray my-auto py-3 text-xs"
											on:click={() => (selectedMap = null)}
										>
											cancel
										</button>
										<button
											class="btn btn-primary flex items-center content-center h-max my-auto"
											on:click={make}
										>
											<Icon icon={'majesticons:rocket-3-start'} width={16} />
											<span class="pl-4 pr-2"> make game </span>
										</button>
									</div>
									{#if postStatus === 'error'}
										<p
											class="text-red-500 block p-3 mb-4 w-full text-sm bg-red-50 rounded-lg border border-red-300 shadow-sm"
										>
											{postResponse.message}
										</p>
									{/if}
								</div>
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
							{/if}
						</div>
					</div>
				{:else}
					<div class="space-y-8">
						<SearchWithTypes on:load={createLoader} types={mapTypes} />

						{#each maps as map}
							<button
								class="w-full transition-all outline-none rounded-xl ring-primary-500 ring-offset-4 hover:ring focus:ring hover:scale-105 focus:scale-105"
								on:click={() => (selectedMap = map)}
							>
								<MapCard {map} />
							</button>
						{/each}

						{#if !maps?.length}
							<p
								class="text-gray-500 block p-3 mb-4 w-full text-sm bg-gray-50 rounded-lg border border-gray-200 shadow-sm"
							>
								We could not find any results for your search. Try broaden your search to get more
								results.
							</p>
						{:else if !hasMore}
							<p
								class="text-brand-500 block p-3 mb-4 w-full text-sm bg-brand-50 rounded-lg border border-brand-200 shadow-sm"
							>
								You have reached the end of the list. Stop scrolling and and pick a map already!
							</p>
						{/if}
					</div>
				{/if}
			</section>
		</div>
	</ContentWithFooter>
</InfiniteScroll>
