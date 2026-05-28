<script lang="ts">
	import { createEventDispatcher } from 'svelte'

	export let value: string
	export let id: string
	export let name: string
	// Only `textarea` is treated specially — every other value renders as the
	// regular text input, so this accepts the common HTML input types callers pass.
	export let type: 'textarea' | 'text' | 'email' | 'password' | 'tel' | 'url' | 'number' =
		'text'
	export let placeholder: string
	export let label: string = ''
	export let message: string = ''
	export let icon: string | undefined = undefined
	export let showPrivacy: boolean = false

	export let required: boolean = false
	export let attempted: boolean = false
	export let invalid: boolean = false
	export let forceValid: boolean = false

	const dispatch = createEventDispatcher()

	$: stateClass = invalid
		? 'border-destructive bg-destructive/5'
		: forceValid
			? 'border-success bg-success/5'
			: ''

	$: labelClass = invalid ? 'text-destructive' : forceValid ? 'text-success' : ''

	$: messageClass = invalid
		? 'text-destructive'
		: forceValid
			? 'text-success'
			: 'text-muted-foreground'

	$: attemptedClass = attempted ? 'invalid:border-destructive invalid:bg-destructive/5' : ''
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
			on:change={(e) => dispatch('change', e)}
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
				on:change={(e) => dispatch('change', e)}
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
			We will never share your details. Read our
			<a href="/privacy" class="link">Privacy Policy</a>.
		</p>
	{/if}
</div>
