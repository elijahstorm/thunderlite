<script lang="ts">
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'

	export let inputs = [
		{
			text: 'Email',
			id: 'email_reset',
			type: 'email',
			icon: '/icon/person.svg',
		},
	]

	type ResponseInfo = void | {
		message?: string
		error?: string
	}
	export let error: null | string = ''
	export let callback: (form: HTMLFormElement) => Promise<ResponseInfo>

	let formElement: HTMLFormElement
	let requestError: Promise<ResponseInfo>
	let requestSent = false
	let attempted = false

	const sendRequest = async () => {
		attempted = true
		error = validateForm()

		if (error !== '') {
			return false
		}

		if (callback) {
			requestError = callback(formElement)
			requestSent = true
		}
	}

	const validateForm = (): string => {
		error = null
		let password

		for (let input of inputs) {
			const value = formElement[input.id].value

			if (input.id === 'password') {
				if (value.length < 6) return 'Password should be at least 6 characters'

				password = value
			} else if (input.id === 'pass_confirm' && value != password) {
				return "Passwords don't match"
			}
		}

		return ''
	}
</script>

<section
	class="bg-white w-full overflow-hidden my-8 mx-auto border border-gray-400 rounded-lg max-w-md shadow-md"
>
	{#if requestError}
		{#await requestError}
			<div class="flex h-80 justify-center items-center">
				<Loader />
			</div>
		{:then response}
			<div class="flex h-80 justify-center items-center">
				<p class="text-red-500 py-4 px-4">
					{response &&
						(response?.error ? response.error : response.message ?? 'Finished processing request')}
				</p>
			</div>
		{/await}
	{:else}
		<div class="p-8">
			<h1 class="text-brand-500 text-center font-bold text-2xl mt-4 mb-5">
				<slot name="title">Reset Password</slot>
			</h1>

			{#if error !== ''}
				<div
					class="border py-4 px-6 rounded-lg text-sm mt-6 text-red-500 bg-red-100 border-red-400"
				>
					{error}
				</div>
			{:else}
				<p class="border border-transparent text-left text-gray-500 text-ms mt-6 py-2 px-0">
					<slot name="help">
						Enter your email address below and we'll send you a link to reset your password.
					</slot>
				</p>
			{/if}

			<div class="relative w-full mt-6 mx-auto">
				<form bind:this={formElement} on:submit|preventDefault={sendRequest}>
					{#each inputs as input (input.id)}
						<DataInput
							text={input.text}
							name={input.id}
							id={input.id}
							type={input.type}
							icon={input.icon}
							{attempted}
							required
						/>
					{/each}

					{#if requestSent}
						<button
							class="border-none w-full rounded-lg text-sm uppercase text-white bg-brand-800 py-4 px-6 opacity-60"
						>
							Request Sent
						</button>
					{:else}
						<button
							class="border-none w-full rounded-lg text-sm uppercase text-white bg-brand-800 py-4 px-6"
							type="submit"
						>
							<slot name="button">Reset Password</slot>
						</button>
					{/if}
				</form>
			</div>
		</div>

		<slot name="bottom" />
	{/if}
</section>
