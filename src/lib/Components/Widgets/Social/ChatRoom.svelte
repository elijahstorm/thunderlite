<script lang="ts">
	import { writable } from 'svelte/store'
	import { browser } from '$app/environment'
	import UserImageAndName from './UserImageAndName.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import { generateKey } from '$lib/Security/keys'
	import { onMount } from 'svelte'

	type Message = {
		source: string
		target: string
		message: string
		created_at: Date
	}

	export let source: string
	export let target: string
	const targetUser = writable<UserDBData>()
	const sourceUser = writable<UserDBData>()

	const limit = 10
	let page = -1
	let hasMore = true

	const messages = writable<
		{
			key: string
			user: UserDBData
			messages: Message[]
		}[]
	>([])

	const loadMoreMessage = () =>
		hasMore &&
		fetch(
			`/api/user/${target}/messages?${new URLSearchParams({
				page: `${++page}`,
			})}`
		)
			.then((response) => response.json())
			.then((data) => {
				const moreMessages = data.messages as Message[]
				if (!moreMessages || moreMessages.length < limit) hasMore = false
				if (!moreMessages) return
				const parsedMessages = moreMessages.reverse().map((message) => ({
					...message,
					key: generateKey(),
					user: message.source === source ? $sourceUser : $targetUser,
					messages: moreMessages,
				}))

				$messages = [...$messages, ...parsedMessages]
			})

	const fetchUserData = (userAuth: string, resolve: (data: { user: UserDBData }) => void) =>
		fetch(`/api/user/${userAuth}`)
			.then((res) => res.json())
			.then(resolve)

	const shortenDate = (when?: Date, now = new Date()) => {
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

	onMount(() => {
		if (browser) {
			fetchUserData(target, (data) => {
				if (data.user) {
					$targetUser = data.user
				}
			})
			fetchUserData(source, (data) => {
				if (data.user) {
					$sourceUser = data.user
				}
			})
			loadMoreMessage()
		}
	})
</script>

<div class="p:2 sm:p-6 justify-between flex flex-col h-screen">
	<header class="flex sm:items-center justify-between py-3 border-b-2 border-gray-200">
		<div class="relative flex items-center space-x-4">
			<UserImageAndName user={$targetUser} text />
		</div>
		<div class="flex items-center space-x-2">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
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
					></path>
				</svg>
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
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
					></path>
				</svg>
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
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
					></path>
				</svg>
			</button>
		</div>
	</header>
	<div
		class="flex flex-col-reverse justify-start h-full gap-y-4 p-3 overflow-y-auto scrolling-touch"
	>
		{#each $messages as messageGroups (messageGroups.key)}
			<div class="flex items-end" class:justify-end={messageGroups.user.auth === source}>
				<div
					class="flex flex-col space-y-2 text-xs max-w-xs mx-2 items-start"
					class:order-2={messageGroups.user.auth === target}
				>
					<p class="truncate text-xs text-center self-center text-gray-600 opacity-80">
						{shortenDate(new Date(messageGroups.messages[0].created_at))}
					</p>
					{#each messageGroups.messages as message, index (`${new Date(message.created_at).getTime()}_${index}`)}
						<div
							class="px-4 py-2 rounded-lg inline-block bg-gray-300 text-gray-600"
							class:bg-gray-300={messageGroups.user.auth === target}
							class:text-gray-600={messageGroups.user.auth === target}
							class:bg-blue-600={messageGroups.user.auth === source}
							class:text-white={messageGroups.user.auth === source}
							class:rounded-bl-none={messageGroups.user.auth === target &&
								index === messageGroups.messages.length - 1}
							class:rounded-br-none={messageGroups.user.auth === source &&
								index === messageGroups.messages.length - 1}
						>
							{message.message}
						</div>
					{/each}
				</div>
				<div class:order-2={messageGroups.user.auth === source}>
					<UserIcon user={messageGroups.user} noClick />
				</div>
			</div>
		{/each}
	</div>
	<div class="border-t-2 border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
		<div class="relative flex">
			<span class="absolute inset-y-0 flex items-center">
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-full h-12 w-12 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						class="h-6 w-6 text-gray-600"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
						></path>
					</svg>
				</button>
			</span>
			<input
				type="text"
				placeholder="Write your message!"
				class="w-full focus:outline-none focus:placeholder-gray-400 text-gray-600 placeholder-gray-600 pl-12 bg-gray-200 rounded-md py-3"
			/>
			<div class="absolute right-0 items-center inset-y-0 hidden sm:flex">
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-full h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						class="h-6 w-6 text-gray-600"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
						></path>
					</svg>
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-full h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						class="h-6 w-6 text-gray-600"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
						></path>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
						></path>
					</svg>
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-full h-10 w-10 transition duration-500 ease-in-out text-gray-500 hover:bg-gray-300 focus:outline-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						class="h-6 w-6 text-gray-600"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-lg px-4 py-3 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
				>
					<span class="font-bold">Send</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-6 w-6 ml-2 transform rotate-90"
					>
						<path
							d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
						></path>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>
