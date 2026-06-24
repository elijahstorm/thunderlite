<script lang="ts">
	import { page } from '$app/state'
	import { redirectAfterLogin, refreshSession } from '$lib/dontcode/client'

	type Mode = 'login' | 'signup' | 'verify-email' | 'mfa'

	let mode: Mode = 'login'
	let email = ''
	let password = ''
	let confirmPassword = ''
	let code = ''
	let recoveryCode = ''
	let useRecoveryCode = false
	let loading = false
	let errorMessage = ''
	let noticeMessage = ''

	const NETWORK_ERROR = 'Could not reach the server. Please try again.'

	const postJson = async (url: string, body: unknown) => {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		return response.json()
	}

	/** Move to a new step, clearing per-step input and messages. */
	const goTo = (next: Mode) => {
		mode = next
		code = ''
		recoveryCode = ''
		useRecoveryCode = false
		errorMessage = ''
		noticeMessage = ''
	}

	const switchMode = (next: 'login' | 'signup') => goTo(next)

	const finishLogin = async () => {
		await refreshSession()
		redirectAfterLogin(page.url.searchParams.get('redirectTo'))
	}

	const submitSignup = async () => {
		if (password !== confirmPassword) {
			errorMessage = 'Passwords do not match'
			return
		}
		const data = await postJson('/api/auth/signup', { email, password })
		if (!data.success) {
			errorMessage = data.error ?? 'Something went wrong. Please try again.'
			return
		}
		if (data.verification_required) {
			goTo('verify-email')
			noticeMessage = 'We emailed you a 6-digit code. Enter it below to verify your account.'
			return
		}
		if (!data.loggedIn) {
			goTo('login')
			noticeMessage = 'Account successfully created. Please sign in.'
			return
		}
		await finishLogin()
	}

	const submitLogin = async () => {
		const data = await postJson('/api/auth/login', { email, password })
		if (data.verificationRequired) {
			goTo('verify-email')
			noticeMessage = 'Please verify your email — enter the code we sent you.'
			return
		}
		if (data.success && data.mfaRequired) {
			goTo('mfa')
			noticeMessage = 'Enter the code from your authenticator app.'
			return
		}
		if (!data.success) {
			errorMessage = data.error ?? 'Invalid email or password.'
			return
		}
		await finishLogin()
	}

	/** After verifying the email, sign in with the credentials still in memory. */
	const loginAfterVerify = async () => {
		if (!password) {
			goTo('login')
			noticeMessage = 'Email verified. Please sign in.'
			return
		}
		const data = await postJson('/api/auth/login', { email, password })
		if (data.success && data.mfaRequired) {
			goTo('mfa')
			noticeMessage = 'Enter the code from your authenticator app.'
			return
		}
		if (!data.success) {
			goTo('login')
			noticeMessage = 'Email verified. Please sign in.'
			return
		}
		await finishLogin()
	}

	const submitVerifyEmail = async () => {
		const data = await postJson('/api/auth/verify-email', { code })
		if (!data.success) {
			errorMessage = data.error ?? 'That code is invalid or has expired.'
			return
		}
		await loginAfterVerify()
	}

	const submitMfa = async () => {
		const payload = useRecoveryCode ? { recoveryCode } : { code }
		const data = await postJson('/api/auth/mfa', payload)
		if (!data.success) {
			if (data.expired) {
				goTo('login')
				errorMessage = data.error ?? 'Your sign-in session expired. Please sign in again.'
				return
			}
			errorMessage = data.error ?? 'That code is invalid.'
			return
		}
		await finishLogin()
	}

	const submit = async () => {
		errorMessage = ''
		noticeMessage = ''
		loading = true
		try {
			if (mode === 'signup') await submitSignup()
			else if (mode === 'login') await submitLogin()
			else if (mode === 'verify-email') await submitVerifyEmail()
			else if (mode === 'mfa') await submitMfa()
		} catch {
			errorMessage = NETWORK_ERROR
		} finally {
			loading = false
		}
	}

	$: isCodeStep = mode === 'verify-email' || mode === 'mfa'
	$: heading =
		mode === 'login'
			? 'Sign in'
			: mode === 'signup'
				? 'Create your account'
				: mode === 'verify-email'
					? 'Verify your email'
					: 'Two-factor authentication'
	$: subheading =
		mode === 'login'
			? 'Welcome back — pick up where you left off.'
			: mode === 'signup'
				? 'Join ThunderLite to play, build, and share maps.'
				: mode === 'verify-email'
					? 'Enter the 6-digit code we emailed you.'
					: useRecoveryCode
						? 'Enter one of your recovery codes.'
						: 'Enter the code from your authenticator app.'
	$: submitLabel =
		mode === 'login'
			? 'Sign in'
			: mode === 'signup'
				? 'Create account'
				: mode === 'verify-email'
					? 'Verify email'
					: 'Verify code'
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">{heading}</h1>
		<p class="text-sm text-muted-foreground">{subheading}</p>
	</div>

	{#if !isCodeStep}
		<div class="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'login'}
				class="btn btn-sm {mode === 'login' ? 'btn-primary' : 'btn-ghost'}"
				on:click={() => switchMode('login')}
			>
				Sign in
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'signup'}
				class="btn btn-sm {mode === 'signup' ? 'btn-primary' : 'btn-ghost'}"
				on:click={() => switchMode('signup')}
			>
				Sign up
			</button>
		</div>
	{/if}

	{#if noticeMessage}
		<p class="text-sm p-3 rounded-lg border border-border bg-surface-2">{noticeMessage}</p>
	{/if}

	<form class="space-y-4" on:submit|preventDefault={submit}>
		{#if mode === 'login' || mode === 'signup'}
			<div class="space-y-1.5">
				<label for="email" class="field-label">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					class="input"
					placeholder="you@example.com"
					autocomplete="email"
					required
					bind:value={email}
				/>
			</div>

			<div class="space-y-1.5">
				<label for="password" class="field-label">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					class="input"
					placeholder="••••••••"
					autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
					required
					bind:value={password}
				/>
			</div>

			{#if mode === 'signup'}
				<div class="space-y-1.5">
					<label for="confirm-password" class="field-label">Confirm password</label>
					<input
						id="confirm-password"
						name="confirm-password"
						type="password"
						class="input"
						placeholder="••••••••"
						autocomplete="new-password"
						required
						bind:value={confirmPassword}
					/>
				</div>
			{/if}
		{:else if mode === 'verify-email' || (mode === 'mfa' && !useRecoveryCode)}
			<div class="space-y-1.5">
				<label for="code" class="field-label">Verification code</label>
				<input
					id="code"
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					class="input tracking-[0.5em] text-center text-lg"
					placeholder="123456"
					maxlength="6"
					required
					bind:value={code}
				/>
			</div>
		{:else}
			<div class="space-y-1.5">
				<label for="recovery-code" class="field-label">Recovery code</label>
				<input
					id="recovery-code"
					name="recovery-code"
					type="text"
					autocomplete="off"
					class="input text-center"
					placeholder="xxxx-xxxx"
					required
					bind:value={recoveryCode}
				/>
			</div>
		{/if}

		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}

		<button class="btn btn-primary w-full" type="submit" disabled={loading}>
			{loading ? 'Please wait…' : submitLabel}
		</button>
	</form>

	{#if mode === 'mfa'}
		<button
			type="button"
			class="link text-sm"
			on:click={() => {
				useRecoveryCode = !useRecoveryCode
				code = ''
				recoveryCode = ''
				errorMessage = ''
			}}
		>
			{useRecoveryCode ? 'Use your authenticator code instead' : "Can't access your authenticator? Use a recovery code"}
		</button>
	{/if}

	{#if isCodeStep}
		<button type="button" class="link text-sm" on:click={() => goTo('login')}>
			← Back to sign in
		</button>
	{:else}
		<p class="text-xs text-muted-foreground">
			We will never share your details. Read our
			<a href="/privacy" class="link">Privacy Policy</a>.
		</p>
	{/if}
</div>
