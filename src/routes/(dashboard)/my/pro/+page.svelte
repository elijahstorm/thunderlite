<script lang="ts">
	import Icon from '@iconify/svelte'
	import { addToast } from 'as-toast'
	import { invalidateAll } from '$app/navigation'
	import { PLANS, PERKS, formatPrice, type PlanId, type SubscriptionView } from '$lib/Pro/plans'

	let { data } = $props()

	let subscription = $derived(data.subscription as SubscriptionView | null)
	let isPro = $derived(subscription?.isPro ?? false)

	let selectedPlan: PlanId = $state('monthly')
	let checkoutOpen = $state(false)
	let processing = $state(false)

	// Test-mode card fields. These never leave the browser — the server records
	// only the chosen plan. They exist so the payment flow can be exercised.
	let cardName = $state('')
	let cardNumber = $state('')
	let cardExpiry = $state('')
	let cardCvc = $state('')

	let plan = $derived(PLANS[selectedPlan])

	const formatDate = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				})
			: '—'

	const openCheckout = (planId: PlanId) => {
		selectedPlan = planId
		checkoutOpen = true
	}

	const closeCheckout = () => {
		if (processing) return
		checkoutOpen = false
	}

	// Prefill obviously-fake test values so the flow is one click to try.
	const fillTestCard = () => {
		cardName = 'Test Player'
		cardNumber = '4242 4242 4242 4242'
		cardExpiry = '12 / 34'
		cardCvc = '123'
	}

	const cardComplete = () =>
		cardName.trim() && cardNumber.trim() && cardExpiry.trim() && cardCvc.trim()

	const submitCheckout = async () => {
		if (!cardComplete() || processing) return
		processing = true
		try {
			// Simulate the round-trip to a payment processor.
			await new Promise((resolve) => setTimeout(resolve, 900))
			const response = await fetch('/api/pro/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ plan: selectedPlan }),
			})
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			addToast('Welcome to ThunderLite Pro!')
			checkoutOpen = false
			await invalidateAll()
		} catch (err) {
			addToast(`Payment failed. ${err}`, 'warn')
		} finally {
			processing = false
		}
	}

	const cancel = async () => {
		if (processing) return
		processing = true
		try {
			const response = await fetch('/api/pro/cancel', { method: 'POST' })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			addToast('Subscription will end at the period close.')
			await invalidateAll()
		} catch (err) {
			addToast(`Could not cancel. ${err}`, 'warn')
		} finally {
			processing = false
		}
	}

	const resume = async () => {
		if (processing) return
		processing = true
		try {
			const response = await fetch('/api/pro/resume', { method: 'POST' })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			addToast('Your subscription is active again.')
			await invalidateAll()
		} catch (err) {
			addToast(`Could not resume. ${err}`, 'warn')
		} finally {
			processing = false
		}
	}
</script>

<section>
	<header class="mb-6 flex items-start justify-between gap-3">
		<div>
			<p class="section-eyebrow">Upgrade</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">ThunderLite Pro</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Get more out of the game and help keep the project alive.
			</p>
		</div>
		{#if isPro}
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary"
			>
				<Icon icon="lucide:sparkles" width={13} />
				Pro
			</span>
		{/if}
	</header>

	{#if isPro && subscription}
		<!-- Active subscriber: manage the existing plan. -->
		<div class="card p-6 sm:p-8 space-y-6">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
					<p class="text-2xl font-semibold tracking-tight text-foreground mt-1">
						{PLANS[subscription.plan].label} · {formatPrice(subscription.priceCents)}
						<span class="text-sm font-normal text-muted-foreground">/{subscription.interval}</span>
					</p>
				</div>
				<span
					class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
					class:bg-accent={!subscription.cancelAtPeriodEnd}
					class:text-accent-foreground={!subscription.cancelAtPeriodEnd}
					class:bg-muted={subscription.cancelAtPeriodEnd}
					class:text-muted-foreground={subscription.cancelAtPeriodEnd}
				>
					{subscription.cancelAtPeriodEnd ? 'Canceling' : 'Active'}
				</span>
			</div>

			<p class="text-sm text-muted-foreground">
				{#if subscription.cancelAtPeriodEnd}
					Pro access ends on <span class="text-foreground font-medium"
						>{formatDate(subscription.currentPeriodEnd)}</span
					>. You can resume any time before then.
				{:else}
					Renews on <span class="text-foreground font-medium"
						>{formatDate(subscription.currentPeriodEnd)}</span
					>.
				{/if}
			</p>

			<div class="border-t border-border pt-6 flex flex-wrap gap-3">
				{#if subscription.cancelAtPeriodEnd}
					<button class="btn btn-primary" onclick={resume} disabled={processing}>
						Resume subscription
					</button>
				{:else}
					<button class="btn btn-secondary" onclick={cancel} disabled={processing}>
						Cancel subscription
					</button>
				{/if}
			</div>

			<p class="text-xs text-muted-foreground flex items-center gap-1.5">
				<Icon icon="lucide:flask-conical" width={13} />
				Test mode. No real charge is made. Pro currently unlocks nothing; it exists to exercise the billing
				flow.
			</p>
		</div>
	{:else}
		<!-- Not subscribed: perks + plan picker. -->
		<div class="card p-6 sm:p-8 space-y-6">
			<ul class="grid sm:grid-cols-2 gap-3">
				{#each PERKS as perk (perk.label)}
					<li class="flex items-start gap-3 text-sm text-foreground">
						<span
							class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground shrink-0"
						>
							<Icon icon={perk.icon} width={16} />
						</span>
						{perk.label}
					</li>
				{/each}
			</ul>

			<div class="border-t border-border pt-6 grid sm:grid-cols-2 gap-3">
				{#each Object.values(PLANS) as p (p.id)}
					<button
						type="button"
						class="text-left rounded-lg border p-4 transition-colors"
						class:border-secondary={selectedPlan === p.id}
						class:bg-accent={selectedPlan === p.id}
						class:border-border={selectedPlan !== p.id}
						class:hover:bg-muted={selectedPlan !== p.id}
						onclick={() => (selectedPlan = p.id)}
					>
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-foreground">{p.label}</span>
							{#if p.badge}
								<span
									class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary/10 text-secondary"
								>
									{p.badge}
								</span>
							{/if}
						</div>
						<p class="mt-2 text-xl font-semibold tracking-tight text-foreground">
							{formatPrice(p.priceCents)}
							<span class="text-sm font-normal text-muted-foreground">/{p.interval}</span>
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">{p.cadence}</p>
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="text-xs text-muted-foreground flex items-center gap-1.5">
					<Icon icon="lucide:flask-conical" width={13} />
					Test mode. No real charge is made.
				</p>
				<button class="btn btn-primary" onclick={() => openCheckout(selectedPlan)}>
					Subscribe · {formatPrice(plan.priceCents)}/{plan.interval}
				</button>
			</div>
		</div>
	{/if}
</section>

{#if checkoutOpen}
	<!-- Simulated checkout. Card details stay in the browser. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
		onclick={closeCheckout}
		onkeydown={(e) => e.key === 'Escape' && closeCheckout()}
		role="button"
		tabindex="-1"
		aria-label="Close checkout"
	>
		<div
			class="card w-full max-w-md p-6 sm:p-8 space-y-5"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold tracking-tight text-foreground">Checkout</h2>
					<p class="text-sm text-muted-foreground mt-0.5">
						{PLANS[selectedPlan].label} · {formatPrice(plan.priceCents)}/{plan.interval}
					</p>
				</div>
				<button
					class="text-muted-foreground hover:text-foreground"
					onclick={closeCheckout}
					disabled={processing}
					aria-label="Close"
				>
					<Icon icon="lucide:x" width={18} />
				</button>
			</div>

			<div
				class="flex items-center gap-2 rounded-md bg-secondary/10 px-3 py-2 text-xs text-secondary"
			>
				<Icon icon="lucide:flask-conical" width={14} />
				Test mode. This won't charge a real card.
				<button class="ml-auto underline hover:no-underline" type="button" onclick={fillTestCard}>
					Use test card
				</button>
			</div>

			<div class="space-y-3">
				<label class="block">
					<span class="text-xs font-medium text-muted-foreground">Name on card</span>
					<input
						class="input mt-1 w-full"
						type="text"
						autocomplete="cc-name"
						bind:value={cardName}
						placeholder="Test Player"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium text-muted-foreground">Card number</span>
					<input
						class="input mt-1 w-full"
						type="text"
						inputmode="numeric"
						autocomplete="cc-number"
						bind:value={cardNumber}
						placeholder="4242 4242 4242 4242"
					/>
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-muted-foreground">Expiry</span>
						<input
							class="input mt-1 w-full"
							type="text"
							autocomplete="cc-exp"
							bind:value={cardExpiry}
							placeholder="MM / YY"
						/>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-muted-foreground">CVC</span>
						<input
							class="input mt-1 w-full"
							type="text"
							inputmode="numeric"
							autocomplete="cc-csc"
							bind:value={cardCvc}
							placeholder="123"
						/>
					</label>
				</div>
			</div>

			<button
				class="btn btn-primary w-full"
				onclick={submitCheckout}
				disabled={processing || !cardComplete()}
			>
				{#if processing}
					<Icon icon="lucide:loader-circle" class="animate-spin" width={16} />
					Processing…
				{:else}
					Pay {formatPrice(plan.priceCents)}
				{/if}
			</button>
		</div>
	</div>
{/if}
