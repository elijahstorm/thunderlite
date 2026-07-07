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

{#if sourceUser && targetUser && (messageGroup.user === sourceUser.auth || messageGroup.user === targetUser.auth)}
	{@const mine = messageGroup.user === sourceUser.auth}
	<div class="flex items-end gap-2" class:justify-end={mine} class:flex-row-reverse={mine}>
		<div class="flex-shrink-0">
			<UserIcon user={mine ? sourceUser : targetUser} noClick size={1.75} />
		</div>
		<div class="flex flex-col gap-1 max-w-[75%]" class:items-end={mine}>
			<p class="text-[11px] text-muted-foreground px-1">
				{shortenDate(new Date(messageGroup.messages[0].created_at))}
			</p>
			{#each messageGroup.messages as message, index (`${new Date(message.created_at).getTime()}_${message.message}`)}
				<div
					class="px-3 py-2 rounded-2xl text-sm break-words w-fit"
					class:bg-brand-500={mine}
					class:text-white={mine}
					class:bg-muted={!mine}
					class:text-foreground={!mine}
					class:rounded-br-sm={mine && index === messageGroup.messages.length - 1}
					class:rounded-bl-sm={!mine && index === messageGroup.messages.length - 1}
				>
					{message.message}
				</div>
			{/each}
		</div>
	</div>
{/if}
