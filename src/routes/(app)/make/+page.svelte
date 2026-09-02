<script lang="ts">
	import type { PageData } from './$types'
	import Icon from '@iconify/svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import MapCardSkeleton from '$lib/Components/Feedback/MapCardSkeleton.svelte'
	import { dbMapsStore, dbUsersStore } from '$lib/Stores/dbStores'
	import InfiniteScroll from '$lib/Components/Widgets/Helpers/InfiniteScroll.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import SearchWithTypes from '$lib/Components/Widgets/Forms/SearchWithTypes.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	// `data.listing` / `data.mapTypes` are streamed promises (see +page.server.ts):
	// the shell renders instantly and these flush in a beat later. Seed local,
	// mutable state from them so the infinite-scroll loader can keep appending.
	let maps = $state<MapDBData[]>([])
	let users = $state<UserDBData[]>([])
	let mapTypes = $state<string[]>([])
	let listingReady = $state(false)
	let listingError = $state(false)

	$effect(() => {
		let cancelled = false

		data.listing
			.then((res) => {
				if (cancelled) return
				maps = res.maps.map((map: MapDBData) => ({
					...map,
					created_at: new Date(map.created_at),
					updated_at: new Date(map.updated_at),
				}))
				users = res.users.map((user: UserDBData) => ({
					...user,
					created_at: new Date(user.created_at),
				}))
				listingReady = true
			})
			.catch(() => {
				if (cancelled) return
				listingError = true
				listingReady = true
			})

		data.mapTypes
			.then((types) => {
				if (!cancelled) mapTypes = types
			})
			.catch(() => {})

		return () => {
			cancelled = true
		}
	})

	let loader = $state(() => {})
	let hasMore = $state(true)

	const createLoader: (
		props: { search: string; type: string },
		load?: boolean,
		startPage?: number
	) => void = ({ search, type }, load = true, startPage = 0) => {
		// `startPage` lets the initial mount continue from page 1: the server load
		// already handed us page 0, so paginating from 0 again would re-fetch and
		// duplicate that first batch. A fresh search/filter starts back at page 0.
		let page = startPage - 1
		// A freshly (re)created loader replaces the list on its first response;
		// later pages append. Flipped to false after the first successful page.
		let replace = load
		hasMore = true
		loader = () =>
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
						const incoming = data.users.map((user: UserDBData) => ({
							...user,
							created_at: new Date(user.created_at),
						}))
						users = replace ? incoming : [...users, ...incoming]
					}
					if (data.maps) {
						dbMapsStore.update(updateStore(data.maps))
						const incoming = data.maps.map((map: MapDBData) => ({
							...map,
							created_at: new Date(map.created_at),
							updated_at: new Date(map.updated_at),
						}))
						maps = replace ? incoming : [...maps, ...incoming]
						replace = false
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

	// The server load already provided page 0; hand the scroll loader page 1 so it
	// extends the list rather than re-fetching and duplicating that first page.
	createLoader({ search: '', type: '' }, false, 1)

	const updateStore =
		<T extends object>(data: T[], key = 'id') =>
		(store: { [key: string]: T }) =>
			data?.reduce((store, value) => {
				if (!value) return store
				// @ts-ignore
				store[value[key]] = value
				return store
			}, store) ?? store

	$effect(() => {
		dbUsersStore.update(updateStore(users, 'auth'))
		dbMapsStore.update(updateStore(maps))
	})
</script>

<InfiniteScroll tailwind="max-h-screen h-screen" threshold={600} onload={loader}>
	<ContentWithFooter noFooterOnMobile>
		<Header />

		<div class="container py-8">
			<div class="space-y-8">
				<header class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="section-eyebrow">Maps</p>
						<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">
							Browse community maps
						</h1>
						<p class="text-sm text-muted-foreground mt-1">Pick a map to start a game.</p>
					</div>
					<a href="/editor?new" class="btn btn-outline">
						<Icon icon="lucide:hammer" width={14} />
						Create a map
					</a>
				</header>

				<SearchWithTypes onload={createLoader} types={mapTypes} />

				{#if !listingReady}
					<div class="grid gap-5">
						{#each Array.from({ length: 4 }) as _, i (i)}
							<MapCardSkeleton />
						{/each}
					</div>
				{:else if listingError}
					<div class="card p-10 text-center text-sm text-destructive">
						We couldn't load the maps. Please refresh and try again.
					</div>
				{:else}
					<div class="grid gap-5">
						{#each maps as map (map.public_id)}
							<a
								href="/map/{map.public_id}"
								class="block w-full text-left rounded-xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-0.5"
							>
								<MapCard {map} />
							</a>
						{/each}
					</div>

					{#if !maps?.length}
						<div class="card p-10 text-center text-sm text-muted-foreground">
							No maps matched your search.
						</div>
					{:else if !hasMore}
						<div class="card p-6 text-center text-sm text-muted-foreground border-dashed">
							End of the list.
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</ContentWithFooter>
</InfiniteScroll>
