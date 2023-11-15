<script lang="ts">
	import { writable } from 'svelte/store'
	import FallbackImage from '../Images/FallbackImage.svelte'
	import { browser } from '$app/environment'

	export let user: UserDBData

	let relationship: string
	let auth = writable<string | null>(null)

	if (browser) {
		import('$lib/Components/Auth/hanko').then((hanko) => (auth = hanko.userAuth))
	}

	const getRelationshipStatus = () =>
		fetch(`/api/user/${user.auth}/relationship`)
			.then((response) => response.json())
			.then((data) => (relationship = data?.status))

	const friend = () => fetch(`/api/user/${user.auth}/friend-request`, { method: 'POST' })

	const block = () => fetch(`/api/user/${user.auth}/block`, { method: 'POST' })

	const follow = () => fetch(`/api/user/${user.auth}/follow`, { method: 'POST' })

	const message = () => fetch(`/api/user/${user.auth}/message`, { method: 'POST' })

	$: {
		if ($auth && $auth !== user.auth) {
			getRelationshipStatus()
		}
	}
</script>

<div
	class="border bg-white rounded-lg overflow-hidden shadow-lg max-w-sm mx-auto transition-all duration-200 hover:shadow-xl"
>
	<FallbackImage
		src={user.profile_image_url}
		alt="User Profile"
		tailwind="object-cover w-full"
		style="aspect-ratio:320/320;object-fit:cover"
	/>
	<div class="p-4">
		<h2 class="text-2xl font-bold hover:text-gray-700 transition-all duration-200">
			{user.display_name ?? 'No Name'}
		</h2>
		<h3 class="text-gray-500 hover:text-gray-600 transition-all duration-200">
			@{user.username ?? 'anonymous'}
		</h3>
		<p class="mt-2 text-gray-600 hover:text-gray-700 transition-all duration-200">
			{user.bio ?? 'No bio'}
		</p>
		{#if $auth && $auth !== user.auth}
			<div class="flex mt-4 space-x-2" class:hidden={true}>
				<button
					class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground h-9 rounded-md px-3 w-full hover:bg-gray-700 hover:text-white transition-all duration-200"
					on:click|stopPropagation={friend}
				>
					Friend
				</button>
				<button
					class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground h-9 rounded-md px-3 w-full hover:bg-gray-700 hover:text-white transition-all duration-200"
					on:click|stopPropagation={block}
				>
					Block
				</button>
			</div>
			<div class="flex mt-4 space-x-2">
				<button
					class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground h-9 rounded-md px-3 w-full hover:bg-gray-700 hover:text-white transition-all duration-200"
					on:click|stopPropagation={follow}
				>
					Follow
				</button>
				<button
					class="inline-flex items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent h-9 rounded-md px-3 w-full hover:border-gray-700 hover:text-gray-700 transition-all duration-200"
					on:click|stopPropagation={message}
				>
					Message
				</button>
			</div>
		{/if}
	</div>
</div>
