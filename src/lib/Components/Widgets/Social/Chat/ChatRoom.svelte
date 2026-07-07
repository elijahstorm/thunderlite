<script lang="ts">
	import { writable, type Writable } from 'svelte/store'
	import { browser } from '$app/environment'
	import { generateKey } from '$lib/Security/keys'
	import { onMount } from 'svelte'
	import ChatMessageGroups from './ChatMessageGroups.svelte'
	import InfiniteScroll from '../../Helpers/InfiniteScroll.svelte'
	import ChatInput from './ChatInput.svelte'
	import ChatHeader from './ChatHeader.svelte'

	interface Props {
		socketMessages: Writable<
			(MessageDBData & {
				created_at: Date
				read_at: Date | null
			})[]
		>
		highlight?: boolean
		source: string
		target: string
		ontoggle?: () => void
	}

	let { socketMessages, highlight = false, source, target, ontoggle }: Props = $props()
	const targetUser = writable<UserDBData>()
	const sourceUser = writable<UserDBData>()

	const limit = 10
	let page = -1
	let hasMore = true

	const allMessages = writable<MessageDBData[]>([])

	const shouldFlowTogether = (lastMessage: Date | undefined, currentMessage: Date) =>
		!lastMessage ||
		Math.abs(new Date(lastMessage).getTime() - new Date(currentMessage).getTime()) < 2 * 60 * 1000

	const parseMessages = (allMessages: MessageDBData[]) => {
		allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
		const parsedMessages = []
		for (let i = 0; i < allMessages.length;) {
			const firstMessageInGroup = allMessages[i]
			const currentUser = firstMessageInGroup.source
			const messageGroup = []
			let lastMessageTimestamp: Date | undefined
			for (; i < allMessages.length; i++) {
				if (
					allMessages[i].source === currentUser &&
					shouldFlowTogether(lastMessageTimestamp, allMessages[i].created_at)
				) {
					lastMessageTimestamp = allMessages[i].created_at
					messageGroup.push(allMessages[i])
				} else break
			}
			parsedMessages.push({
				key: generateKey(),
				user: firstMessageInGroup.source,
				messages: messageGroup.reverse(),
			})
		}
		return parsedMessages
	}

	const loadMoreMessage = () =>
		hasMore &&
		fetch(
			`/api/user/${target}/messages?${new URLSearchParams({
				page: `${++page}`,
			})}`
		)
			.then((response) => response.json())
			.then((data) => {
				const moreMessages = data.messages as MessageDBData[]
				if (!moreMessages || moreMessages.length < limit) hasMore = false
				if (!moreMessages) return
				$allMessages = [...$allMessages, ...moreMessages]
			})

	const fetchUserData = (userAuth: string, resolve: (data: { user: UserDBData }) => void) =>
		fetch(`/api/user/${userAuth}`)
			.then((res) => res.json())
			.then(resolve)

	const populateMessage = (data: { message: string }) => {
		const { message } = data
		if (!message) return
		// Optimistic render; the ChatInput form POST persists it and the server
		// pushes it to the recipient's inbox (see /api/user/[userAuth]/message).
		$allMessages = [
			{
				target,
				source,
				message,
				created_at: new Date(),
			},
			...$allMessages,
		]
	}

	onMount(() => {
		if (browser && !$targetUser) {
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

<div class="justify-between flex flex-col h-full max-h-screen">
	<ChatHeader user={$targetUser} {ontoggle} {highlight} />
	<InfiniteScroll
		tailwind="flex flex-col-reverse max-h-[calc(21.25rem-1px)] h-[calc(21.25rem-1px)] justify-start gap-y-4 p-3 overflow-y-auto scrolling-touch"
		threshold={40}
		reverse
		onload={loadMoreMessage}
	>
		{#each parseMessages( [...$allMessages, ...$socketMessages.filter((m) => m.source === target && m.target === source)] ) as messageGroup (messageGroup.key)}
			<ChatMessageGroups {messageGroup} sourceUser={$sourceUser} targetUser={$targetUser} />
		{/each}
	</InfiniteScroll>
	<ChatInput {target} onsend={populateMessage} />
</div>
