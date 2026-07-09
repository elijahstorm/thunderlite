<script lang="ts">
	import Icon from '@iconify/svelte'
	import { addToast } from 'as-toast'
	import { invalidateAll } from '$app/navigation'
	import {
		PLANS,
		PERKS,
		PAYMENT_METHODS,
		formatPrice,
		type PlanId,
		type ProPaymentMethod,
		type SubscriptionView,
	} from '$lib/Pro/plans'

	let { data } = $props()

	let subscription = $derived(data.subscription as SubscriptionView | null)
	let isPro = $derived(subscription?.isPro ?? false)

	let selectedPlan: PlanId = $state('monthly')
	let selectedMethod: ProPaymentMethod = $state('card')
	let checkoutOpen = $state(false)
	let processing = $state(false)

	let plan = $derived(PLANS[selectedPlan])

	const post = (path: string, body?: unknown) =>
		fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		})

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

	// Real billing via the DontCode payments gateway (PortOne): reserve a
	// subscription, issue a billing key in the provider popup, then confirm it.
	const submitCheckout = async () => {
		if (processing) return
		processing = true
		try {
			const reserveRes = await post('/api/pro/subscribe/reserve', {
				plan: selectedPlan,
				method: selectedMethod,
			})
			if (!reserveRes.ok) throw new Error(`Could not start checkout (${reserveRes.status})`)
			const { reservation } = await reserveRes.json()

			// Lazy import so the PortOne browser SDK never loads server-side.
			const { issueBillingKey } = await import('$lib/Pro/portone')
			const issued = await issueBillingKey(reservation, selectedMethod)

			if ('error' in issued) {
				// Popup dismissed or failed — release the half-open reservation.
				await post('/api/pro/subscribe/abort', {
					subscriptionId: reservation.subscriptionId,
				})
				throw new Error(issued.error)
			}

			const confirmRes = await post('/api/pro/subscribe/confirm', {
				subscriptionId: reservation.subscriptionId,
				billingKey: issued.billingKey,
			})
			if (!confirmRes.ok) throw new Error(`Could not confirm (${confirmRes.status})`)

			addToast('Welcome to ThunderLite Pro!')
			checkoutOpen = false
			await invalidateAll()
		} catch (err) {
			addToast(`Checkout failed. ${err instanceof Error ? err.message : err}`, 'warn')
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
				<Icon icon="lucide:shield-check" width={13} />
				Billing is handled securely by our payment provider. Manage or cancel any time.
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
					<Icon icon="lucide:shield-check" width={13} />
					Secure checkout. Cancel any time.
				</p>
				<button class="btn btn-primary" onclick={() => openCheckout(selectedPlan)}>
					Subscribe · {formatPrice(plan.priceCents)}/{plan.interval}
				</button>
			</div>
		</div>
	{/if}
</section>

{#if checkoutOpen}
	<!-- Checkout: pick a method, then authorize a billing key in the provider popup. -->
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
				<Icon icon="lucide:lock" width={14} />
				Secure checkout. You'll authorize payment with your provider in the next step.
			</div>

			<div class="space-y-2">
				<span class="text-xs font-medium text-muted-foreground">Payment method</span>
				<div class="grid grid-cols-2 gap-2">
					{#each PAYMENT_METHODS as method (method.id)}
						<button
							type="button"
							class="flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors"
							class:border-secondary={selectedMethod === method.id}
							class:bg-accent={selectedMethod === method.id}
							class:border-border={selectedMethod !== method.id}
							class:hover:bg-muted={selectedMethod !== method.id}
							onclick={() => (selectedMethod = method.id)}
							disabled={processing}
						>
							<Icon icon={method.icon} width={16} />
							{method.label}
						</button>
					{/each}
				</div>
				<p class="text-[11px] text-muted-foreground">
					Card is billed in USD. KakaoPay, TossPay and NaverPay are billed in KRW at today's rate.
				</p>
			</div>

			<button class="btn btn-primary w-full" onclick={submitCheckout} disabled={processing}>
				{#if processing}
					<Icon icon="lucide:loader-circle" class="animate-spin" width={16} />
					Processing…
				{:else}
					Continue · {formatPrice(plan.priceCents)}/{plan.interval}
				{/if}
			</button>
		</div>
	</div>
{/if}
