<script lang="ts">
	import { redirectAfterLogin, refreshSession } from '$lib/dontcode/client'

	let mode: 'login' | 'signup' = 'login'
	let email = ''
	let password = ''
	let confirmPassword = ''
	let loading = false
	let errorMessage = ''
	let verificationRequired = false
	let noticeMessage = ''

	const switchMode = (next: 'login' | 'signup') => {
		mode = next
		errorMessage = ''
		verificationRequired = false
		noticeMessage = ''
	}

	const submit = async () => {
		errorMessage = ''
		verificationRequired = false
		noticeMessage = ''

		if (mode === 'signup' && password !== confirmPassword) {
			errorMessage = 'Passwords do not match'
			return
		}

		loading = true
		try {
			const response = await fetch(`/api/auth/${mode}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			})
			const data = await response.json()

			if (!data.success) {
				errorMessage = data.error ?? 'Something went wrong. Please try again.'
				return
			}

			if (mode === 'signup' && data.verification_required && !data.loggedIn) {
				verificationRequired = true
				return
			}

			// Account created but not signed in automatically — flip to the
			// login form and prompt the user to sign in.
			if (mode === 'signup' && !data.loggedIn) {
				password = ''
				confirmPassword = ''
				mode = 'login'
				noticeMessage = 'Account successfully created. Please sign in.'
				return
			}

			await refreshSession()
			redirectAfterLogin()
		} catch {
			errorMessage = 'Could not reach the server. Please try again.'
		} finally {
			loading = false
		}
	}
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">
			{mode === 'login' ? 'Sign in' : 'Create your account'}
		</h1>
		<p class="text-sm text-muted-foreground">
			{mode === 'login'
				? 'Welcome back — pick up where you left off.'
				: 'Join ThunderLite to play, build, and share maps.'}
		</p>
	</div>

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

	{#if verificationRequired}
		<p class="text-sm p-3 rounded-lg border border-border bg-surface-2">
			Almost there! Check your email to verify your account, then sign in.
		</p>
	{/if}

	{#if noticeMessage}
		<p class="text-sm p-3 rounded-lg border border-border bg-surface-2">
			{noticeMessage}
		</p>
	{/if}

	<form class="space-y-4" on:submit|preventDefault={submit}>
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

		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}

		<button class="btn btn-primary w-full" type="submit" disabled={loading}>
			{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
		</button>
	</form>

	<p class="text-xs text-muted-foreground">
		We will never share your details. Read our
		<a href="/privacy" class="link">Privacy Policy</a>.
	</p>
</div>
