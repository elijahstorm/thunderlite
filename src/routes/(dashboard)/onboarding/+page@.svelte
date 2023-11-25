<script lang="ts">
	import type { PageData } from './$types.js'
	import { enhance } from '$app/forms'
	import { goto } from '$app/navigation'
	import { addToast } from 'as-toast'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'

	export let data: PageData
	$: user = data.user
	$: auth = data.auth ?? ''

	export let form
	let errors: { [key: string]: string } = {}

	let updated: UserDBData
	let usernameTaken = false

	const resetForm = (data = {}) =>
		(updated = {
			...{
				id: -1,
				auth,
				username: '',
				display_name: '',
				profile_image_url: '',
				bio: '',
				created_at: new Date(),
			},
			...(user ?? {}),
			...data,
		})

	resetForm()

	const checkUsernameTaken = (data: { detail: { target: { value: string } } }) =>
		data.detail.target.value &&
		fetch(`/api/user/exists/${data.detail.target.value}`)
			.then((response) => response.json())
			.then((data) => (usernameTaken = data.exists?.length))

	$: {
		errors = Object.entries(form?.errors ?? {}).reduce(
			(carry, [dataName, errors]) => ({ ...carry, [dataName]: errors[0] }),
			{}
		)
	}

	$: user && resetForm()
</script>

<ContentWithFooter noFooterOnMobile>
	<Header />
	<div class="md:container w-full break break-word">
		<div class="max-w-md mx-auto py-8">
			{#if auth}
				{#if updated.username}
					<p class="text-lg pb-4">Upload a picture for you!</p>

					<ImageUploader
						alt="user profile"
						src={updated.profile_image_url}
						{auth}
						on:complete={() => goto('/make')}
					/>
				{:else}
					<form
						method="POST"
						use:enhance={({ formData, cancel }) => {
							if (usernameTaken) cancel()
							formData.set(
								'username',
								formData.get('username')?.toString().replace(/.*@/, '') ?? ''
							)
							return async ({ result, update }) => {
								if (result.status !== 200 && result.status !== 400) {
									addToast('Error saving your data', 'warn')
								}
								update()
								if (result.data?.validated) resetForm(result.data?.validated)
							}
						}}
					>
						<p class="text-lg">Make your account</p>

						<DataInput
							icon="/images/icons/person.svg"
							value={updated.display_name}
							placeholder="Solid Scoundral"
							label="Display name"
							name="display_name"
							id="display_name"
							invalid={Object.hasOwn(errors, 'display_name')}
							message={errors.display_name ?? ''}
							showPrivacy
						/>

						<DataInput
							value={updated.username ? `@${updated.username}` : ''}
							placeholder="@solidscoundral26"
							label="Username"
							name="username"
							id="username"
							invalid={usernameTaken || Object.hasOwn(errors, 'username')}
							message={usernameTaken
								? 'Sorry! This username is already taken'
								: errors.username ?? ''}
							on:change={checkUsernameTaken}
						/>

						<DataInput
							value={updated.bio}
							placeholder="I like spicy food and..."
							label="About you"
							name="bio"
							id="bio"
							type="textarea"
							invalid={Object.hasOwn(errors, 'bio')}
							message={errors.bio ?? ''}
						/>

						<div class="w-full flex justify-end gap-4 pt-4">
							<button class="btn btn-primary" type="submit"> save </button>
						</div>
					</form>
				{/if}
			{:else}
				<p
					class="text-red-500 block p-3 mb-4 w-full text-sm bg-red-50 rounded-lg border border-red-300 shadow-sm"
				>
					Please create an account before setting up your account here.
				</p>
			{/if}
		</div>
	</div>
</ContentWithFooter>
