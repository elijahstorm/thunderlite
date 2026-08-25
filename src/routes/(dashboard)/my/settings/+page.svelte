<script lang="ts">
	import Icon from '@iconify/svelte'
	import { untrack } from 'svelte'
	import { addToast } from 'as-toast'

	interface Prefs {
		email_enabled: boolean
		subscription: boolean
		social: boolean
		game: boolean
	}

	let { data } = $props()

	const defaults: Prefs = { email_enabled: true, subscription: true, social: true, game: true }
	// Seed editable state from the server's snapshot once; later edits are local
	// and persisted via the POST response, so we intentionally don't re-track data.
	let prefs = $state<Prefs>(untrack(() => ({ ...defaults, ...(data.prefs ?? {}) })))
	let saving = $state(false)

	const categories: { key: keyof Prefs; label: string; description: string }[] = [
		{
			key: 'subscription',
			label: 'Support',
			description: 'Donation receipts and recurring support updates.',
		},
		{
			key: 'social',
			label: 'Social',
			description: 'Friend requests and direct messages.',
		},
		{ key: 'game', label: 'Game', description: 'Match results and game updates.' },
	]

	const save = async (next: Prefs) => {
		saving = true
		try {
			const res = await fetch('/api/notifications/prefs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(next),
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const body = await res.json()
			prefs = body.prefs
		} catch (err) {
			addToast(`Could not save. ${err instanceof Error ? err.message : err}`, 'warn')
		} finally {
			saving = false
		}
	}

	const toggleMaster = () => save({ ...prefs, email_enabled: !prefs.email_enabled })
	const toggleCategory = (key: keyof Prefs) => save({ ...prefs, [key]: !prefs[key] })
</script>

<section>
	<header class="mb-6">
		<p class="section-eyebrow">Preferences</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
	</header>

	<div class="card p-6 sm:p-8 space-y-6">
		<div>
			<h2 class="text-lg font-semibold tracking-tight text-foreground">Email notifications</h2>
			<p class="text-sm text-muted-foreground mt-0.5">Choose which emails you want to receive.</p>
		</div>

		<label class="flex items-center justify-between gap-4 border-b border-border pb-4">
			<span>
				<span class="block text-sm font-medium text-foreground">All email notifications</span>
				<span class="block text-xs text-muted-foreground mt-0.5">
					The master switch. Turn off to stop every email below.
				</span>
			</span>
			<input
				type="checkbox"
				class="h-5 w-5 shrink-0 accent-secondary"
				checked={prefs.email_enabled}
				disabled={saving}
				onchange={toggleMaster}
			/>
		</label>

		<div class="space-y-4" class:opacity-50={!prefs.email_enabled}>
			{#each categories as category (category.key)}
				<label class="flex items-center justify-between gap-4">
					<span>
						<span class="block text-sm font-medium text-foreground">{category.label}</span>
						<span class="block text-xs text-muted-foreground mt-0.5">{category.description}</span>
					</span>
					<input
						type="checkbox"
						class="h-5 w-5 shrink-0 accent-secondary"
						checked={prefs[category.key]}
						disabled={saving || !prefs.email_enabled}
						onchange={() => toggleCategory(category.key)}
					/>
				</label>
			{/each}
		</div>

		<p class="text-xs text-muted-foreground flex items-center gap-1.5">
			<Icon icon="lucide:info" width={13} />
			Account emails such as sign-in verification are always sent.
		</p>
	</div>
</section>
