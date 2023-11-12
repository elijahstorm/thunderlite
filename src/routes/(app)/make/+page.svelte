<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import { Card } from 'flowbite-svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import MapCard from '$lib/Components/Widgets/Social/MapCard.svelte'
	import Icon from '@iconify/svelte'
	import MakeGameMapCard from '$lib/Components/Widgets/Social/MakeGameMapCard.svelte'
	import { dbMapsStore, dbUsersStore } from '$lib/Stores/dbStores'

	export let data: PageData
	$: maps = data.maps
	$: users = data.users

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
</script>

<section class="pt-6 pb-16 px-5 sm:px-8 md:px-0 mx-auto sm:max-w-[640px] md:max-w-none">
	{#if selectedMap}
		<div class="m-auto">
			<div class="p-8 border text-card-foreground bg-white dark:bg-gray-800 rounded-xl shadow-md">
				{#if postStatus === 'idle'}
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
					</div>
				{:else if postStatus === 'error'}
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
				{/if}
			</div>
		</div>
	{:else}
		<div class="space-y-8">
			{#each maps as map}
				<button
					class="w-full transition-all outline-none rounded-xl ring-primary-500 ring-offset-4 hover:ring focus:ring hover:scale-105 focus:scale-105"
					on:click={() => (selectedMap = map)}
				>
					<MapCard {map} />
				</button>
			{/each}
		</div>
	{/if}
</section>
