<script lang="ts">
	import Loader from '../Helpers/Loader.svelte'

	export let title: string
	export let prompt: string
	export let type: string

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
</script>

<section class="bg-white">
	<div class="py-8 lg:py-16 px-4 mx-auto max-w-screen-md">
		<h2 class="mb-4 text-4xl tracking-tight font-extrabold text-center text-gray-900">
			{title}
		</h2>

		<p class="mb-8 lg:mb-16 font-light text-center text-gray-500 sm:text-xl">
			{prompt}
		</p>

		{#if postStatus === 'error'}
			<p
				class="text-red-500 block p-3 mb-4 w-full text-sm bg-red-50 rounded-lg border border-red-300 shadow-sm"
			>
				{postResponse.message}
			</p>
		{:else if postStatus === 'success'}
			<p
				class="text-brand-500 block p-3 mb-4 w-full text-sm bg-gray-50 rounded-lg border border-brand-300 shadow-sm"
			>
				{postResponse.message}
			</p>

			<p>
				<span class="opacity-50"> Ticket number: </span>

				<span>{postResponse.ticket}</span>
			</p>

			<p>
				<span class="opacity-50"> Contact message type: </span>

				<span>{type}</span>
			</p>

			<p>
				<span class="opacity-50"> Email: </span>

				<span>{postResponse.email}</span>
			</p>

			<p>
				<span class="opacity-50"> Date received: </span>

				<span>{postResponse.date?.toDateString()}</span>
			</p>
		{:else if postStatus === 'sending'}
			<Loader />
		{:else}
			<form on:submit|preventDefault={submit} method="POST" class="space-y-8">
				<div>
					<label for="email" class="block mb-2 text-sm font-medium text-gray-900">Your email</label>
					<input
						class="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
						type="email"
						placeholder="name@email.com"
						required
						bind:value={email}
					/>
				</div>

				<div>
					<label for="subject" class="block mb-2 text-sm font-medium text-gray-900">Subject</label>
					<input
						class="block p-3 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 shadow-sm focus:ring-primary-500 focus:border-primary-500"
						type="text"
						placeholder="Let us know how we can help you"
						required
						bind:value={subject}
					/>
				</div>

				<div class="sm:col-span-2">
					<label for="message" class="block mb-2 text-sm font-medium text-gray-900"
						>Your message</label
					>
					<textarea
						class="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg shadow-sm border border-gray-300 focus:ring-primary-500 focus:border-primary-500"
						rows="6"
						placeholder="Leave a comment..."
						bind:value={message}
					/>
				</div>

				<button
					type="submit"
					class="btn btn-secondary py-3 px-5 text-sm font-medium text-center text-white rounded-lg bg-primary-700 sm:w-fit hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 :bg-primary-700"
					>Send message</button
				>
			</form>
		{/if}
	</div>
</section>
