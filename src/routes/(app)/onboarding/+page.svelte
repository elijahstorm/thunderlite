<script lang="ts">
	import { enhance } from '$app/forms'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'
	import { addToast } from 'as-toast'

	export let data
	$: auth = data.auth ?? ''

	export let form
	let errors: { [key: string]: string } = {}

	let updated: UserDBData
	let usernameTaken = false

	const resetForm = () =>
		(updated = {
			id: -1,
			auth,
			username: '',
			display_name: '',
			profile_image_url: '',
			bio: '',
			created_at: new Date(),
		})

	resetForm()

	$: {
		errors = Object.entries(form?.errors ?? {}).reduce(
			(carry, [dataName, errors]) => ({ ...carry, [dataName]: errors[0] }),
			{}
		)
	}
</script>

{#if auth}
	<form
		method="POST"
		use:enhance={({ formData, cancel }) => {
			if (usernameTaken) cancel()
			formData.set('username', formData.get('username')?.toString().replace(/.*@/, '') ?? '')
			return async ({ result, update }) => {
				if (result.status !== 200 && result.status !== 400) {
					addToast('Error saving your data', 'warn')
				}
				update()
			}
		}}
	>
		<ImageUploader alt="user profile" src={updated.profile_image_url} {auth} />

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
{:else}
	<p
		class="text-red-500 block p-3 mb-4 w-full text-sm bg-red-50 rounded-lg border border-red-300 shadow-sm"
	>
		Please create an account before setting up your account here.
	</p>
{/if}
