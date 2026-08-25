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
		// The docked chat panel is a fixed-height widget, so its transcript is
		// pinned to a set height. On the standalone /chat page the room instead
		// owns whatever room is left under the site header, so the transcript
		// flexes. `min-h-0` is what lets a flex child actually shrink and scroll.
		fill?: boolean
	}

	let {
		socketMessages,
		highlight = false,
		source,
		target,
		ontoggle,
		fill = false,
	}: Props = $props()
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

<div class="justify-between flex flex-col h-full" class:max-h-screen={!fill} class:min-h-0={fill}>
	<ChatHeader user={$targetUser} {ontoggle} {highlight} />
	<InfiniteScroll
		tailwind="flex flex-col-reverse justify-start gap-y-4 p-3 overflow-y-auto scrolling-touch {fill
			? 'flex-1 min-h-0'
			: 'max-h-[calc(21.25rem-1px)] h-[calc(21.25rem-1px)]'}"
		threshold={40}
		reverse
		onload={loadMoreMessage}
	>
		{#each parseMessages( [...$allMessages, ...$socketMessages.filter((m) => m.source === target && m.target === source)] ) as messageGroup (messageGroup.key)}
			<ChatMessageGroups {messageGroup} sourceUser={$sourceUser} targetUser={$targetUser} />
		{/each}
	</InfiniteScroll>
	<!-- A block closes the conversation both ways. The transcript stays readable
	     (it is history either side may want) but there is nothing left to send:
	     /api/user/[userAuth]/message refuses the POST, so leaving a live composer
	     here would only produce a toast for every attempt. -->
	{#if $targetUser?.blocked}
		<p class="border-t border-border p-3 text-center text-sm text-muted-foreground">
			You and this player can't message each other.
		</p>
	{:else}
		<ChatInput {target} onsend={populateMessage} />
	{/if}
</div>
