<script lang="ts">
	import Icon from '@iconify/svelte'
	import { addToast } from 'as-toast'
	import { invalidateAll } from '$app/navigation'
	import {
		PLANS,
		SUPPORT_POINTS,
		PAYMENT_METHODS,
		DONATION_PRESETS_CENTS,
		DONATION_MIN_CENTS,
		DONATION_MAX_CENTS,
		formatPrice,
		type PlanId,
		type ProPaymentMethod,
		type SubscriptionView,
	} from '$lib/Pro/plans'

	let { data } = $props()

	let subscription = $derived(data.subscription as SubscriptionView | null)
	let isSupporter = $derived(subscription?.isPro ?? false)
	let donationsEnabled = $derived(data.donationsEnabled as boolean)

	// The checkout modal serves both flows: a one-time donation and recurring support.
	type CheckoutMode = 'donate' | 'subscribe'
	let checkoutMode = $state<CheckoutMode>('subscribe')

	let selectedPlan: PlanId = $state('monthly')
	let selectedMethod: ProPaymentMethod = $state('card')
	let checkoutOpen = $state(false)
	let processing = $state(false)
	// Checkout errors surface inside the modal, not as a toast — a toast renders
	// behind the provider popup and the modal, so the user would never see it.
	let checkoutError = $state<string | null>(null)

	let plan = $derived(PLANS[selectedPlan])

	// One-time donation amount: preset chips or a custom dollar field.
	let donationCents = $state(500)
	let customAmount = $state('')
	let customCents = $derived.by(() => {
		const dollars = Number(customAmount)
		if (!Number.isFinite(dollars) || dollars <= 0) return null
		return Math.round(dollars * 100)
	})
	let activeDonationCents = $derived(customAmount !== '' ? customCents : donationCents)
	let donationValid = $derived(
		activeDonationCents !== null &&
			activeDonationCents >= DONATION_MIN_CENTS &&
			activeDonationCents <= DONATION_MAX_CENTS
	)

	let checkoutAmountLabel = $derived(
		checkoutMode === 'donate'
			? formatPrice(activeDonationCents ?? 0)
			: `${formatPrice(plan.priceCents)}/${plan.interval}`
	)

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

	const openCheckout = (mode: CheckoutMode) => {
		checkoutMode = mode
		checkoutError = null
		checkoutOpen = true
	}

	const closeCheckout = () => {
		if (processing) return
		checkoutOpen = false
	}

	// One-time donation: get popup config + paymentId, charge in the PortOne
	// popup, then have the server verify the settled payment with the gateway.
	const submitDonation = async () => {
		const amountCents = activeDonationCents
		if (!amountCents || !donationValid) {
			checkoutError = 'Pick a donation amount first.'
			return
		}

		const startRes = await post('/api/pro/donate/start', {
			amountCents,
			method: selectedMethod,
		})
		if (!startRes.ok) {
			const body = await startRes.json().catch(() => null)
			throw new Error(body?.message ?? `Could not start the donation (${startRes.status})`)
		}
		const { payment } = await startRes.json()

		// Lazy import so the PortOne browser SDK never loads server-side.
		const { requestDonation } = await import('$lib/Pro/portone')
		const paid = await requestDonation(payment, selectedMethod)
		if ('error' in paid) throw new Error(paid.error)

		const verifyRes = await post('/api/pro/donate/verify', {
			paymentId: paid.paymentId,
			amountCents,
			method: selectedMethod,
		})
		if (!verifyRes.ok) {
			const body = await verifyRes.json().catch(() => null)
			throw new Error(body?.message ?? `Could not confirm the donation (${verifyRes.status})`)
		}

		addToast(`Thank you for the ${formatPrice(amountCents)} donation!`)
	}

	// Recurring support via the DontCode payments gateway (PortOne): reserve a
	// subscription, issue a billing key in the provider popup, then confirm it.
	const submitSubscription = async () => {
		const reserveRes = await post('/api/pro/subscribe/reserve', {
			plan: selectedPlan,
			method: selectedMethod,
		})
		if (!reserveRes.ok) {
			const body = await reserveRes.json().catch(() => null)
			throw new Error(body?.message ?? `Could not start checkout (${reserveRes.status})`)
		}
		const { reservation } = await reserveRes.json()

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
		if (!confirmRes.ok) {
			const body = await confirmRes.json().catch(() => null)
			throw new Error(body?.message ?? `Could not confirm (${confirmRes.status})`)
		}

		addToast('You are officially a supporter. Thank you!')
	}

	const submitCheckout = async () => {
		if (processing) return
		processing = true
		checkoutError = null
		try {
			if (checkoutMode === 'donate') await submitDonation()
			else await submitSubscription()
			checkoutOpen = false
			await invalidateAll()
		} catch (err) {
			checkoutError = err instanceof Error ? err.message : String(err)
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
			addToast('Your support will end at the period close. Thank you for backing the project.')
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
			addToast('Your support is active again. Thank you!')
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
			<p class="section-eyebrow">Support</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
				Support ThunderLite
			</h1>
			<p class="text-sm text-muted-foreground mt-1">
				ThunderLite is free, with no paywalled content. If you want to help cover servers and
				development, this is the place. Patreon style: give once, or back the project monthly.
			</p>
		</div>
		{#if isSupporter}
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary"
			>
				<Icon icon="lucide:heart" width={13} />
				Supporter
			</span>
		{/if}
	</header>

	<div class="space-y-6">
		<!-- What donations pay for. -->
		<div class="card p-6 sm:p-8">
			<ul class="grid sm:grid-cols-2 gap-3">
				{#each SUPPORT_POINTS as point (point.label)}
					<li class="flex items-start gap-3 text-sm text-foreground">
						<span
							class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground shrink-0"
						>
							<Icon icon={point.icon} width={16} />
						</span>
						{point.label}
					</li>
				{/each}
			</ul>
		</div>

		<div class="grid lg:grid-cols-2 gap-6 items-start">
			{#if donationsEnabled}
				<!-- One-time donation: preset chips or a custom amount. -->
				<div class="card p-6 sm:p-8 space-y-5">
					<div>
						<h2 class="text-lg font-semibold tracking-tight text-foreground">One-time donation</h2>
						<p class="text-sm text-muted-foreground mt-0.5">
							Give whatever feels right. No account changes, no strings.
						</p>
					</div>

					<div class="flex flex-wrap gap-2">
						{#each DONATION_PRESETS_CENTS as cents (cents)}
							<button
								type="button"
								class="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
								class:border-secondary={customAmount === '' && donationCents === cents}
								class:bg-accent={customAmount === '' && donationCents === cents}
								class:border-border={customAmount !== '' || donationCents !== cents}
								class:hover:bg-muted={customAmount !== '' || donationCents !== cents}
								onclick={() => {
									donationCents = cents
									customAmount = ''
								}}
							>
								{formatPrice(cents)}
							</button>
						{/each}
						<label
							class="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"
						>
							<span class="text-muted-foreground">$</span>
							<input
								type="number"
								min={DONATION_MIN_CENTS / 100}
								max={DONATION_MAX_CENTS / 100}
								step="1"
								placeholder="Custom"
								class="w-20 bg-transparent outline-none text-foreground"
								bind:value={customAmount}
							/>
						</label>
					</div>

					{#if customAmount !== '' && !donationValid}
						<p class="text-xs text-destructive">
							Donations can be anywhere from {formatPrice(DONATION_MIN_CENTS)} to {formatPrice(
								DONATION_MAX_CENTS
							)}.
						</p>
					{/if}

					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-xs text-muted-foreground flex items-center gap-1.5">
							<Icon icon="lucide:shield-check" width={13} />
							Secure one-time checkout.
						</p>
						<button
							class="btn btn-primary"
							onclick={() => openCheckout('donate')}
							disabled={!donationValid}
						>
							Donate {donationValid ? formatPrice(activeDonationCents ?? 0) : ''}
						</button>
					</div>
				</div>
			{/if}

			<!-- Recurring support: manage when active, otherwise the plan picker. -->
			{#if isSupporter && subscription}
				<div class="card p-6 sm:p-8 space-y-6">
					<div class="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">Recurring support</p>
							<p class="text-2xl font-semibold tracking-tight text-foreground mt-1">
								{PLANS[subscription.plan].label} · {formatPrice(subscription.priceCents)}
								<span class="text-sm font-normal text-muted-foreground"
									>/{subscription.interval}</span
								>
							</p>
						</div>
						<span
							class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
							class:bg-accent={!subscription.cancelAtPeriodEnd}
							class:text-accent-foreground={!subscription.cancelAtPeriodEnd}
							class:bg-muted={subscription.cancelAtPeriodEnd}
							class:text-muted-foreground={subscription.cancelAtPeriodEnd}
						>
							{subscription.cancelAtPeriodEnd ? 'Ending' : 'Active'}
						</span>
					</div>

					<p class="text-sm text-muted-foreground">
						{#if subscription.cancelAtPeriodEnd}
							Your support ends on <span class="text-foreground font-medium"
								>{formatDate(subscription.currentPeriodEnd)}</span
							>. You can resume any time before then. Nothing about your account changes either way.
						{:else}
							Renews on <span class="text-foreground font-medium"
								>{formatDate(subscription.currentPeriodEnd)}</span
							>. Thank you for keeping the project going.
						{/if}
					</p>

					<div class="border-t border-border pt-6 flex flex-wrap gap-3">
						{#if subscription.cancelAtPeriodEnd}
							<button class="btn btn-primary" onclick={resume} disabled={processing}>
								Resume support
							</button>
						{:else}
							<button class="btn btn-secondary" onclick={cancel} disabled={processing}>
								Cancel support
							</button>
						{/if}
					</div>

					<p class="text-xs text-muted-foreground flex items-center gap-1.5">
						<Icon icon="lucide:shield-check" width={13} />
						Billing is handled securely by our payment provider. Manage or cancel any time.
					</p>
				</div>
			{:else}
				<div class="card p-6 sm:p-8 space-y-5">
					<div>
						<h2 class="text-lg font-semibold tracking-tight text-foreground">Monthly support</h2>
						<p class="text-sm text-muted-foreground mt-0.5">
							Steady support is what makes planning new content possible. Cancel any time.
						</p>
					</div>

					<div class="grid sm:grid-cols-2 gap-3">
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
						<button class="btn btn-primary" onclick={() => openCheckout('subscribe')}>
							Become a supporter · {formatPrice(plan.priceCents)}/{plan.interval}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>

{#if checkoutOpen}
	<!-- Checkout: pick a method, then authorize payment in the provider popup. -->
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
					<h2 class="text-lg font-semibold tracking-tight text-foreground">
						{checkoutMode === 'donate' ? 'One-time donation' : 'Checkout'}
					</h2>
					<p class="text-sm text-muted-foreground mt-0.5">
						{#if checkoutMode === 'donate'}
							{checkoutAmountLabel} donation
						{:else}
							{PLANS[selectedPlan].label} support · {checkoutAmountLabel}
						{/if}
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

			{#if checkoutError}
				<div
					class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					role="alert"
				>
					<Icon icon="lucide:circle-alert" width={14} class="mt-0.5 shrink-0" />
					<span>{checkoutError}</span>
				</div>
			{/if}

			<button class="btn btn-primary w-full" onclick={submitCheckout} disabled={processing}>
				{#if processing}
					<Icon icon="lucide:loader-circle" class="animate-spin" width={16} />
					Processing…
				{:else if checkoutError}
					Try again · {checkoutAmountLabel}
				{:else}
					Continue · {checkoutAmountLabel}
				{/if}
			</button>
		</div>
	</div>
{/if}
