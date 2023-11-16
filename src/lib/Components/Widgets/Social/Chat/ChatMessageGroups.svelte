<script lang="ts">
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	export let messageGroup: {
		key: string
		user: string
		messages: MessageDBData[]
	}
	export let sourceUser: UserDBData
	export let targetUser: UserDBData

	const shortenDate = (when?: Date, now = new Date()) => {
		if (!when) return ''

		const diffMilliseconds = now.getTime() - when.getTime()
		const diffSeconds = Math.floor(diffMilliseconds / 1000)
		const diffMinutes = Math.floor(diffSeconds / 60)
		const diffHours = Math.floor(diffMinutes / 60)
		const diffDays = Math.floor(diffHours / 24)

		if (diffDays >= 1) {
			return new Intl.DateTimeFormat('en', {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
			}).format(when)
		} else if (diffHours >= 1) {
			return `${diffHours}h`
		} else if (diffMinutes >= 1) {
			return `${diffMinutes}m`
		}
		return 'now'
	}
</script>

{#if sourceUser && targetUser}
	<div class="flex items-end" class:justify-end={messageGroup.user === sourceUser.auth}>
		<div
			class="flex flex-col space-y-2 text-xs max-w-xs w-full mx-2 items-start"
			class:order-2={messageGroup.user === targetUser.auth}
		>
			<p class="truncate text-xs text-center self-center text-gray-600 opacity-80 w-full pt-1">
				{shortenDate(new Date(messageGroup.messages[0].created_at))}
			</p>
			{#each messageGroup.messages as message, index (`${new Date(message.created_at).getTime()}_${index}`)}
				<div
					class="px-4 py-2 rounded-lg inline-block bg-gray-300 text-gray-600"
					class:self-end={messageGroup.user === sourceUser.auth}
					class:bg-gray-300={messageGroup.user === targetUser.auth}
					class:text-gray-600={messageGroup.user === targetUser.auth}
					class:bg-blue-600={messageGroup.user === sourceUser.auth}
					class:text-white={messageGroup.user === sourceUser.auth}
					class:rounded-bl-none={messageGroup.user === targetUser.auth &&
						index === messageGroup.messages.length - 1}
					class:rounded-br-none={messageGroup.user === sourceUser.auth &&
						index === messageGroup.messages.length - 1}
				>
					{message.message}
				</div>
			{/each}
		</div>
		<div class:order-2={messageGroup.user === sourceUser.auth}>
			<UserIcon user={messageGroup.user === targetUser.auth ? targetUser : sourceUser} noClick />
		</div>
	</div>
{/if}
