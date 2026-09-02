<script lang="ts">
	// Only `textarea` is treated specially — every other value renders as the

	interface Props {
		value: string
		id: string
		name: string
		// regular text input, so this accepts the common HTML input types callers pass.
		type?: 'textarea' | 'text' | 'email' | 'password' | 'tel' | 'url' | 'number'
		placeholder: string
		label?: string
		message?: string
		icon?: string | undefined
		showPrivacy?: boolean
		required?: boolean
		attempted?: boolean
		invalid?: boolean
		forceValid?: boolean
		onchange?: (e: Event) => void
	}

	let {
		value = $bindable(),
		id,
		name,
		type = 'text',
		placeholder,
		label = '',
		message = '',
		icon = undefined,
		showPrivacy = false,
		required = false,
		attempted = false,
		invalid = false,
		forceValid = false,
		onchange,
	}: Props = $props()

	let stateClass = $derived(
		invalid
			? 'border-destructive bg-destructive/5'
			: forceValid
				? 'border-success bg-success/5'
				: ''
	)

	let labelClass = $derived(invalid ? 'text-destructive' : forceValid ? 'text-success' : '')

	let messageClass = $derived(
		invalid ? 'text-destructive' : forceValid ? 'text-success' : 'text-muted-foreground'
	)

	let attemptedClass = $derived(
		attempted ? 'invalid:border-destructive invalid:bg-destructive/5' : ''
	)
</script>

<div class="space-y-1.5 mt-5">
	<label for={name} class="field-label {labelClass}">
		{label}
	</label>

	{#if type === 'textarea'}
		<textarea
			class="input resize-y min-h-28 {stateClass} {attemptedClass}"
			rows="4"
			{id}
			{name}
			{required}
			{placeholder}
			bind:value
			onchange={(e) => onchange?.(e)}
		></textarea>
	{:else}
		<div class="relative">
			{#if icon}
				<div
					class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 opacity-60"
					style="background: url({icon}) center/contain no-repeat;"
				></div>
			{/if}

			<input
				class="input {icon ? 'pl-10' : ''} {stateClass} {attemptedClass}"
				{id}
				{name}
				{required}
				{placeholder}
				type="text"
				bind:value
				onchange={(e) => onchange?.(e)}
			/>
		</div>
	{/if}

	{#if message}
		<p class="text-xs {messageClass}">
			{message}
		</p>
	{/if}

	{#if showPrivacy}
		<p class="text-xs text-muted-foreground">
			<a href="/privacy" class="link">Privacy Policy</a>
		</p>
	{/if}
</div>
