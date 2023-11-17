<script lang="ts">
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import InfiniteScroll from '../../Helpers/InfiniteScroll.svelte'
	import UserImageAndName from '../UserImageAndName.svelte'
	import { browser } from '$app/environment'
	import { writable } from 'svelte/store'
	import { fly } from 'svelte/transition'
	import { createEventDispatcher } from 'svelte'

	export let highlight = false

	let auth = writable<string | null>(null)

	let me: Promise<UserDBData> | undefined
	let users = writable<UserDBData[]>([])
	let settingsOpen = false
	const dispatch = createEventDispatcher()

	const limit = 10
	let page = -1
	let hasMore = true
	let queryState = ''
	const queryStates = [
		{
			state: ``,
			label: `Show All`,
		},
		{
			state: `/friends`,
			label: `Only Friends`,
		},
		{
			state: `/following`,
			label: `I'm Following`,
		},
		{
			state: `/followers`,
			label: `My Followers`,
		},
	] as const

	const loadMoreUsers = () =>
		hasMore &&
		fetch(
			`/api/users${queryState}?${new URLSearchParams({
				page: `${++page}`,
			})}`
		)
			.then((response) => response.json())
			.then((data) => {
				const moreUsers = data.users as UserDBData[]
				if (!moreUsers || moreUsers.length < limit) hasMore = false
				if (!moreUsers) return
				$users = [...$users, ...moreUsers]
			})

	const openSettings = () => {
		settingsOpen = !settingsOpen
		dispatch('open')
	}

	const newChat = () => {}

	const updateQuery = (state: typeof queryState) => () => {
		if (state === queryState) return
		$users = []
		page = -1
		hasMore = true
		queryState = state
		loadMoreUsers()
	}

	const timeSince = (when?: Date, now = new Date()) => {
		if (!when) return ''

		const diffMilliseconds = now.getTime() - when.getTime()
		const diffSeconds = Math.floor(diffMilliseconds / 1000)
		const diffMinutes = Math.floor(diffSeconds / 60)
		const diffHours = Math.floor(diffMinutes / 60)
		const diffDays = Math.floor(diffHours / 24)
		const diffWeeks = Math.floor(diffDays / 7)
		const diffMonths = Math.floor(diffDays / 30)
		const diffYears = Math.floor(diffDays / 365)

		if (diffYears >= 1) {
			return `${diffYears}y`
		} else if (diffMonths >= 1) {
			return `${diffMonths}m`
		} else if (diffWeeks >= 1) {
			return `${diffWeeks}w`
		} else if (diffDays >= 1) {
			return `${diffDays}d`
		} else if (diffHours >= 1) {
			return `${diffHours}h`
		}
		return 'now'
	}

	$: {
		if (browser) {
			import('$lib/Components/Auth/hanko').then((hanko) => (auth = hanko.userAuth))
		}
	}

	$: {
		if ($auth) {
			if (!me) {
				me = new Promise((resolve) =>
					fetch(`/api/user/${$auth}`)
						.then((response) => response.json())
						.then((data) => resolve(data.user))
				)
			}
			if (!$users.length) {
				loadMoreUsers()
			}
		}
	}
</script>

<section class="h-full antialiased text-gray-600 relative max-w-[340px] w-[340px] mx-auto">
	<header
		class="relative px-5 border-b border-gray-200 transition-colors"
		class:pt-6={!highlight}
		class:pt-4={highlight}
	>
		{#await me}
			<Loader />
		{:then me}
			<button
				type="button"
				class="flex justify-between items-center mb-3 w-full"
				on:click|stopPropagation={() => dispatch('toggle')}
			>
				{#if me}
					<UserImageAndName user={me} text noClick />
				{/if}
				<!-- Settings button -->
				<div class="relative inline-flex flex-shrink-0 gap-2 justify-center items-center">
					<button
						class="text-gray-400 hover:text-gray-500 rounded-full focus:ring-0 outline-none focus:outline-none"
						on:click|stopPropagation={openSettings}
					>
						<span class="sr-only">Settings</span>
						<svg class="w-4 h-4 fill-current" viewBox="0 0 16 16">
							<path
								d="m15.621 7.015-1.8-.451A5.992 5.992 0 0 0 13.13 4.9l.956-1.593a.5.5 0 0 0-.075-.611l-.711-.707a.5.5 0 0 0-.611-.075L11.1 2.87a5.99 5.99 0 0 0-1.664-.69L8.985.379A.5.5 0 0 0 8.5 0h-1a.5.5 0 0 0-.485.379l-.451 1.8A5.992 5.992 0 0 0 4.9 2.87l-1.593-.956a.5.5 0 0 0-.611.075l-.707.711a.5.5 0 0 0-.075.611L2.87 4.9a5.99 5.99 0 0 0-.69 1.664l-1.8.451A.5.5 0 0 0 0 7.5v1a.5.5 0 0 0 .379.485l1.8.451c.145.586.378 1.147.691 1.664l-.956 1.593a.5.5 0 0 0 .075.611l.707.707a.5.5 0 0 0 .611.075L4.9 13.13a5.99 5.99 0 0 0 1.664.69l.451 1.8A.5.5 0 0 0 7.5 16h1a.5.5 0 0 0 .485-.379l.451-1.8a5.99 5.99 0 0 0 1.664-.69l1.593.956a.5.5 0 0 0 .611-.075l.707-.707a.5.5 0 0 0 .075-.611L13.13 11.1a5.99 5.99 0 0 0 .69-1.664l1.8-.451A.5.5 0 0 0 16 8.5v-1a.5.5 0 0 0-.379-.485ZM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
							/>
						</svg>
					</button>
					<button
						type="button"
						class="font-bold text-gray-400 hover:text-gray-500 rounded-full focus:ring-0 outline-none focus:outline-none"
						class:hidden={highlight}
						on:click|stopPropagation={() => dispatch('toggle')}
					>
						X
					</button>
				</div>
			</button>
		{/await}
		{#if settingsOpen}
			<button
				class="fixed inset-0 cursor-default"
				on:click|stopPropagation={() => (settingsOpen = false)}
			/>
			<!-- Dropdown menu -->
			<div
				class="absolute top-14 right-4 z-10 bg-gray-50 divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700 dark:divide-gray-600"
				in:fly={{ y: -20, duration: 200 }}
				out:fly={{ y: -20, duration: 200 }}
			>
				<div class="py-2">
					<a
						href="/me"
						class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white"
					>
						Edit Your Profile
					</a>
				</div>
				<ul
					class="py-2 text-sm text-gray-700 dark:text-gray-200"
					aria-labelledby="dropdownInformationButton"
				>
					{#each queryStates as currentState (currentState.state)}
						<li>
							<button
								class="w-full block text-left px-4 py-2"
								class:hover:bg-gray-100={queryState !== currentState.state}
								class:dark:hover:bg-gray-600={queryState !== currentState.state}
								class:dark:hover:text-white={queryState !== currentState.state}
								class:font-bold={queryState === currentState.state}
								disabled={queryState === currentState.state}
								on:click={updateQuery(currentState.state)}
							>
								{currentState.label}
							</button>
						</li>
					{/each}
				</ul>
				<div class="py-2">
					<a
						href="/support"
						class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white"
					>
						Report someone
					</a>
				</div>
			</div>
		{/if}
	</header>
	<!-- Chat list -->
	<InfiniteScroll tailwind="py-3 px-5 max-h-96 h-96" threshold={60} on:load={loadMoreUsers}>
		<h3 class="text-xs font-semibold uppercase text-gray-400 mb-1">Chats</h3>
		<div class="divide-y divide-gray-200">
			{#if $users?.length}
				{#each $users as user (user.auth)}
					<button
						type="button"
						class="w-full text-left py-2 focus:outline-none focus-visible:bg-indigo-50 hover:bg-indigo-50"
						on:click={() => dispatch('chat', user.auth)}
					>
						<div class="flex items-center overflow-hidden gap-x-3">
							<UserIcon {user} noClick />
							<div>
								<h4 class="text-sm font-semibold text-gray-900">{user.display_name}</h4>
								<div class="text-[13px] flex gap-x-2">
									<p
										class="max-w-[200px] truncate text-ellipsis"
										class:opacity-60={!user.last_message?.message}
									>
										{user.last_message?.message ?? 'No messages'}
									</p>
									{#if user.last_message?.when}
										<span> · </span>
										<p>
											{timeSince(new Date(user.last_message.when))}
										</p>
									{/if}
								</div>
							</div>
						</div>
					</button>
				{/each}
			{:else}
				<p class="text-center pt-6 text-sm opacity-80">It's empty here...</p>
			{/if}
		</div>
	</InfiniteScroll>
	<!-- Bottom right button -->
	<button
		class="absolute bottom-5 right-5 inline-flex transition-colors items-center text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-full text-center px-3 py-2 shadow-lg focus:outline-none focus-visible:ring-2"
		on:click={newChat}
	>
		<svg class="w-3 h-3 fill-current text-indigo-300 flex-shrink-0 mr-2" viewBox="0 0 12 12">
			<path
				d="M11.866.146a.5.5 0 0 0-.437-.139c-.26.044-6.393 1.1-8.2 2.913a4.145 4.145 0 0 0-.617 5.062L.305 10.293a1 1 0 1 0 1.414 1.414L7.426 6l-2 3.923c.242.048.487.074.733.077a4.122 4.122 0 0 0 2.933-1.215c1.81-1.809 2.87-7.94 2.913-8.2a.5.5 0 0 0-.139-.439Z"
			/>
		</svg>
		<span> New Chat </span>
	</button>
</section>
