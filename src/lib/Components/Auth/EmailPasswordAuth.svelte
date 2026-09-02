<script lang="ts">
	import { page } from '$app/state'
	import { redirectAfterLogin, refreshSession } from '$lib/dontcode/client'

	type Mode = 'login' | 'signup' | 'verify-email' | 'mfa' | 'forgot-password' | 'reset-password'

	let mode = $state<Mode>('login')
	let email = $state('')
	let password = $state('')
	let confirmPassword = $state('')
	let code = $state('')
	let recoveryCode = $state('')
	let useRecoveryCode = $state(false)
	let loading = $state(false)
	let errorMessage = $state('')
	let noticeMessage = $state('')

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
		// The reset steps ask for a NEW password; don't prefill it with whatever
		// was typed into the sign-in form.
		if (next === 'forgot-password' || next === 'reset-password') {
			password = ''
			confirmPassword = ''
		}
		code = ''
		recoveryCode = ''
		useRecoveryCode = false
		errorMessage = ''
		noticeMessage = ''
	}

	const switchMode = (next: 'login' | 'signup') => goTo(next)

	const finishLogin = async () => {
		await refreshSession()
		// Await the navigation so the submit button stays in its loading state
		// until /onboarding is actually on screen. Without this the button
		// snaps back to "Sign in" while the redirect target loads, leaving the
		// form sitting there with no sign that anything is happening.
		await redirectAfterLogin(page.url.searchParams.get('redirectTo'))
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
			noticeMessage = 'Please verify your email. Enter the code we sent you.'
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

	const submitForgotPassword = async () => {
		const data = await postJson('/api/auth/forgot-password', { email })
		if (!data.success) {
			errorMessage = data.error ?? 'Something went wrong. Please try again.'
			return
		}
		goTo('reset-password')
		noticeMessage = 'If an account exists for that email, a reset code is on its way.'
	}

	const submitResetPassword = async () => {
		if (password !== confirmPassword) {
			errorMessage = 'Passwords do not match'
			return
		}
		const data = await postJson('/api/auth/reset-password', { code, password, email })
		if (!data.success) {
			errorMessage = data.error ?? 'That code is invalid or has expired.'
			return
		}
		// The new password is still in memory; sign in with it so the user
		// lands straight in the app instead of retyping it.
		const login = await postJson('/api/auth/login', { email, password })
		if (login.success && login.mfaRequired) {
			goTo('mfa')
			noticeMessage = 'Enter the code from your authenticator app.'
			return
		}
		if (!login.success) {
			goTo('login')
			noticeMessage = 'Password updated. Please sign in.'
			return
		}
		await finishLogin()
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
			else if (mode === 'forgot-password') await submitForgotPassword()
			else if (mode === 'reset-password') await submitResetPassword()
		} catch {
			errorMessage = NETWORK_ERROR
		} finally {
			loading = false
		}
	}

	let isCodeStep = $derived(mode !== 'login' && mode !== 'signup')
	let heading = $derived(
		mode === 'login'
			? 'Sign in'
			: mode === 'signup'
				? 'Create your account'
				: mode === 'verify-email'
					? 'Verify your email'
					: mode === 'forgot-password'
						? 'Reset your password'
						: mode === 'reset-password'
							? 'Choose a new password'
							: 'Two-factor authentication'
	)
	let subheading = $derived(
		mode === 'verify-email'
			? 'Enter the 6-digit code we emailed you.'
			: mode === 'forgot-password'
				? 'Enter your email and we will send you a code.'
				: mode === 'reset-password'
					? email
						? `Enter the code we emailed to ${email}.`
						: 'Enter the code we emailed you.'
					: mode === 'mfa'
						? useRecoveryCode
							? 'Enter one of your recovery codes.'
							: 'Enter the code from your authenticator app.'
						: ''
	)
	let submitLabel = $derived(
		mode === 'login'
			? 'Sign in'
			: mode === 'signup'
				? 'Create account'
				: mode === 'verify-email'
					? 'Verify email'
					: mode === 'forgot-password'
						? 'Send code'
						: mode === 'reset-password'
							? 'Reset password'
							: 'Verify code'
	)
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">{heading}</h1>
		{#if subheading}
			<p class="text-sm text-muted-foreground">{subheading}</p>
		{/if}
	</div>

	{#if !isCodeStep}
		<div class="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'login'}
				class="btn btn-sm {mode === 'login' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => switchMode('login')}
			>
				Sign in
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'signup'}
				class="btn btn-sm {mode === 'signup' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => switchMode('signup')}
			>
				Sign up
			</button>
		</div>
	{/if}

	{#if noticeMessage}
		<p class="text-sm p-3 rounded-lg border border-border bg-surface-2">{noticeMessage}</p>
	{/if}

	<form
		class="space-y-4"
		onsubmit={(e) => {
			e.preventDefault()
			submit()
		}}
	>
		{#if mode === 'login' || mode === 'signup' || mode === 'forgot-password'}
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

			{#if mode !== 'forgot-password'}
				<div class="space-y-1.5">
					<div class="flex items-baseline justify-between">
						<label for="password" class="field-label">Password</label>
						{#if mode === 'login'}
							<button type="button" class="link text-xs" onclick={() => goTo('forgot-password')}>
								Forgot password?
							</button>
						{/if}
					</div>
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
			{/if}

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
		{:else if mode === 'reset-password'}
			<div class="space-y-1.5">
				<label for="reset-code" class="field-label">Reset code</label>
				<input
					id="reset-code"
					name="reset-code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					class="input tracking-[0.5em] text-center text-lg"
					placeholder="123456"
					required
					bind:value={code}
				/>
			</div>

			<div class="space-y-1.5">
				<label for="new-password" class="field-label">New password</label>
				<input
					id="new-password"
					name="new-password"
					type="password"
					class="input"
					placeholder="••••••••"
					autocomplete="new-password"
					required
					bind:value={password}
				/>
			</div>

			<div class="space-y-1.5">
				<label for="confirm-new-password" class="field-label">Confirm new password</label>
				<input
					id="confirm-new-password"
					name="confirm-new-password"
					type="password"
					class="input"
					placeholder="••••••••"
					autocomplete="new-password"
					required
					bind:value={confirmPassword}
				/>
			</div>
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
			onclick={() => {
				useRecoveryCode = !useRecoveryCode
				code = ''
				recoveryCode = ''
				errorMessage = ''
			}}
		>
			{useRecoveryCode
				? 'Use your authenticator code instead'
				: "Can't access your authenticator? Use a recovery code"}
		</button>
	{/if}

	{#if mode === 'forgot-password'}
		<button type="button" class="link text-sm" onclick={() => goTo('reset-password')}>
			Already have a code?
		</button>
	{:else if mode === 'reset-password'}
		<button type="button" class="link text-sm" onclick={() => goTo('forgot-password')}>
			Send a new code
		</button>
	{/if}

	{#if isCodeStep}
		<button type="button" class="link text-sm" onclick={() => goTo('login')}>
			← Back to sign in
		</button>
	{:else}
		<p class="text-xs text-muted-foreground">
			<a href="/privacy" class="link">Privacy Policy</a>
		</p>
	{/if}
</div>
