<script lang="ts">
	import { onMount } from 'svelte'
	import Icon from '@iconify/svelte'
	import Loader from '../Helpers/Loader.svelte'

	export let title: string
	export let prompt: string
	export let type: string
	export let prefill = {
		subject: '',
		message: '',
	}

	let email: string
	let subject: string
	let message: string
	let postStatus: 'idle' | 'sending' | 'error' | 'success' = 'idle'
	let postResponse: {
		message: string
		ticket?: number
		email?: string
		date?: Date
	}

	const submit = () => {
		postStatus = 'sending'

		fetch('/api/contact', {
			method: 'POST',
			body: JSON.stringify({ type, email, subject, message }),
			headers: { 'content-type': 'application/json' },
		})
			.then((response) => response.json())
			.then((response) => {
				postStatus = 'success'
				postResponse = {
					message: response.message,
					ticket: response.ticket,
					email: response.email,
					date: new Date(response.date),
				}
			})
			.catch((error) => {
				postStatus = 'error'
				postResponse = { message: error.message }
			})
	}

	onMount(() => {
		subject = prefill.subject
		message = prefill.message
	})
</script>

<section class="max-w-2xl mx-auto py-8">
	<div class="text-center space-y-3 mb-10">
		<p class="section-eyebrow">{type === 'support' ? 'Support' : 'Get in touch'}</p>
		<h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
		<p class="text-muted-foreground max-w-lg mx-auto leading-relaxed">{prompt}</p>
	</div>

	{#if postStatus === 'error'}
		<div
			class="card p-4 mb-6 flex items-start gap-3 border-destructive/40 bg-destructive/5 text-destructive"
		>
			<Icon icon="lucide:circle-x" width={18} class="mt-0.5 shrink-0" />
			<p class="text-sm">{postResponse.message}</p>
		</div>
	{:else if postStatus === 'success'}
		<div class="card p-6 space-y-4">
			<div class="flex items-start gap-3 text-success">
				<Icon icon="lucide:circle-check" width={20} class="mt-0.5 shrink-0" />
				<p class="text-sm text-foreground">{postResponse.message}</p>
			</div>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2 border-t border-border">
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Ticket</dt>
					<dd class="mt-1 text-foreground font-mono">#{postResponse.ticket}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
					<dd class="mt-1 text-foreground">{type}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
					<dd class="mt-1 text-foreground">{postResponse.email}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Received</dt>
					<dd class="mt-1 text-foreground">{postResponse.date?.toDateString()}</dd>
				</div>
			</dl>
		</div>
	{:else if postStatus === 'sending'}
		<div class="py-16">
			<Loader />
		</div>
	{:else}
		<form on:submit|preventDefault={submit} method="POST" class="card p-6 sm:p-8 space-y-5">
			<div>
				<label for="email" class="field-label">Your email</label>
				<input
					id="email"
					class="input"
					type="email"
					placeholder="name@email.com"
					required
					bind:value={email}
				/>
			</div>

			<div>
				<label for="subject" class="field-label">Subject</label>
				<input
					id="subject"
					class="input"
					type="text"
					placeholder="Let us know how we can help"
					required
					bind:value={subject}
				/>
			</div>

			<div>
				<label for="message" class="field-label">Message</label>
				<textarea
					id="message"
					class="input resize-y min-h-32"
					rows="6"
					placeholder="Tell us what's going on…"
					bind:value={message}
				></textarea>
			</div>

			<div class="flex justify-end pt-2">
				<button type="submit" class="btn btn-primary">
					<Icon icon="lucide:send" width={14} />
					Send message
				</button>
			</div>
		</form>
	{/if}
</section>
