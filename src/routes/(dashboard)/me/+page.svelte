<script lang="ts">
	import { enhance } from '$app/forms'
	import HankoProfile from '$lib/Components/Auth/HankoProfile.svelte'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'
	import { addToast } from 'as-toast'

	export let data
	$: user = data.user

	export let form
	let errors: { [key: string]: string } = {}

	let updated: UserDBData
	$: updated = { ...(user ?? {}), ...(updated ?? {}) }

	let usernameTaken = false

	const resetForm = (data = {}) => (updated = { ...(user ?? {}), ...data })

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
</script>

<section>
	<h1 class="py-4 opacity-90 text-lg font-semibold">My Profile</h1>

	<form
		method="POST"
		use:enhance={({ formData, cancel }) => {
			if (usernameTaken) cancel()
			formData.set('username', formData.get('username')?.toString().replace(/.*@/, '') ?? '')
			return async ({ result, update }) => {
				if (result.status !== 200 && result.status !== 400) {
					addToast('Error saving your data', 'warn')
				}
				update({ reset: false })
				// @ts-ignore
				if (result.data?.validated) resetForm(result.data?.validated)
			}
		}}
	>
		<ImageUploader alt="user profile" src={user.profile_image_url} auth={user.auth} />

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
			message={usernameTaken ? 'Sorry! This username is already taken' : errors.username ?? ''}
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
			<button class="btn btn-gray my-auto py-3 text-xs" type="button" on:click={resetForm}>
				cancel
			</button>
			<button class="btn btn-primary" type="submit"> save </button>
		</div>
	</form>
</section>

<section>
	<h1 class="py-4 opacity-90 text-lg font-semibold">Authentication</h1>

	<HankoProfile />
</section>
