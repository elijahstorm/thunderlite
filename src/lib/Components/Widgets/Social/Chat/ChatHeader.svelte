<script lang="ts">
	import { addToast } from 'as-toast'
	import UserImageAndName from '../UserImageAndName.svelte'
	import { createEventDispatcher } from 'svelte'

	export let user: UserDBData
	export let highlight = false

	const dispatch = createEventDispatcher()

	const search = () => addToast('not implemented', 'warn')

	const favorite = () => addToast('not implemented', 'warn')

	const notifications = () => addToast('not implemented', 'warn')
</script>

<button type="button" on:click={() => dispatch('toggle')}>
	<header
		class="flex px-4 sm:items-center justify-between pb-3 border-b border-gray-200"
		class:pt-6={!highlight}
		class:pt-4={highlight}
	>
		<div class="relative flex items-center space-x-4">
			<UserImageAndName {user} text noClick />
		</div>
		<div class="flex items-center space-x-2">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				on:click|stopPropagation={search}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					class="h-6 w-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					>
					</path>
				</svg>
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				on:click|stopPropagation={favorite}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					class="h-6 w-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
					>
					</path>
				</svg>
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				on:click|stopPropagation={notifications}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					class="h-6 w-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
					>
					</path>
				</svg>
			</button>
		</div>
	</header>
</button>
