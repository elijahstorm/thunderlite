<script lang="ts">
	import { browser } from '$app/environment'
	import Icon from '@iconify/svelte'

	/**
	 * The one way to hand a room to another player. A code alone made people
	 * relay it by hand into the join box; the link does the joining for them, so
	 * the code is kept as the fallback for reading it out loud.
	 */
	interface Props {
		session: string
		/** 'full' shows the link, the code and both copy buttons; 'compact' is one button. */
		variant?: 'full' | 'compact'
		label?: string
	}

	let { session, variant = 'full', label = 'Invite link' }: Props = $props()

	let inviteUrl = $derived(browser ? `${location.origin}/rooms/${session}` : `/rooms/${session}`)

	// One shared "copied!" state: the buttons are adjacent, so naming which of
	// them fired matters more than tracking them separately.
	let copied: 'link' | 'code' | null = $state(null)
	let resetTimer: ReturnType<typeof setTimeout> | null = null

	const copy = async (what: 'link' | 'code') => {
		if (!browser || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(what === 'link' ? inviteUrl : session)
			copied = what
			if (resetTimer) clearTimeout(resetTimer)
			resetTimer = setTimeout(() => (copied = null), 2000)
		} catch {
			// Clipboard can be denied; the field stays selectable either way.
		}
	}
</script>

{#if variant === 'compact'}
	<button type="button" class="btn btn-outline btn-sm" onclick={() => copy('link')}>
		<Icon icon={copied === 'link' ? 'lucide:check' : 'lucide:link'} width={14} />
		{copied === 'link' ? 'Copied' : label}
	</button>
{:else}
	<div class="space-y-2">
		<p class="text-xs font-medium text-muted-foreground">{label}</p>
		<div class="flex gap-2">
			<input
				type="text"
				readonly
				value={inviteUrl}
				class="input flex-1 font-mono text-xs"
				onclick={(e) => e.currentTarget.select()}
				aria-label="Invite link"
			/>
			<button type="button" class="btn btn-primary btn-sm shrink-0" onclick={() => copy('link')}>
				<Icon icon={copied === 'link' ? 'lucide:check' : 'lucide:copy'} width={14} />
				{copied === 'link' ? 'Copied' : 'Copy'}
			</button>
		</div>
		<p class="text-xs text-muted-foreground">
			Or read them the room code:
			<button
				type="button"
				data-testid="session-code"
				class="font-mono text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
				onclick={() => copy('code')}
			>
				{session}
			</button>
			{#if copied === 'code'}
				<span class="text-primary">copied</span>
			{/if}
		</p>
	</div>
{/if}
