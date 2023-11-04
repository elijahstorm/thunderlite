<script lang="ts">
	import { enhance } from '$app/forms'
	import HankoProfile from '$lib/Components/Auth/HankoProfile.svelte'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'

	export let data
	$: user = data.user

	export let form

	let updated: UserDBData
	$: updated = { ...(user ?? {}), ...(updated ?? {}) }

	let usernameTaken = false

	const resetForm = () => ({ ...(user ?? {}) })

	const submit: (props: { formData: FormData; cancel: VoidFunction }) => void = ({
		formData,
		cancel,
	}) => {
		console.log(formData.get('email'))
		updated = {
			...updated,
			...{
				email: formData.get('email') as string,
			},
		}
		cancel()
	}
</script>

<section>
	<h1 class="py-4 opacity-90 text-lg font-semibold">My Profile</h1>

	<form method="POST" use:enhance={submit}>
		<ImageUploader alt="user profile" src={user.profile_image_url} />

		<DataInput
			icon="/images/icons/person.svg"
			value={updated.display_name}
			placeholder="solidscoundral26"
			label="Display name"
			name="display_name"
			id="display_name"
			showPrivacy
		/>

		<DataInput
			value={`@${updated.username}`}
			placeholder="@username"
			label="Username"
			name="username"
			id="username"
			invalid={usernameTaken}
			message={usernameTaken ? 'Sorry! This username is already taken' : ''}
		/>

		<DataInput
			value={updated.email}
			placeholder="mail@provider.com"
			label="Email"
			name="email"
			id="email"
			invalid={form?.incorrect || form?.missing}
			message={form?.email ? `${form.email} is not a valid email` : ''}
			showPrivacy
		/>

		<DataInput
			value={updated.bio}
			placeholder="I like spicy food and..."
			label="About you"
			name="bio"
			id="bio"
			type="textarea"
		/>

		<div class="w-full flex justify-end gap-4 pt-4">
			<button class="btn btn-gray my-auto py-3 text-xs" type="button" on:click={resetForm}>
				cancel
			</button>
			<button class="btn btn-primary" type="submit"> save </button>
		</div>
	</form>

	{#if form?.success}
		<p>Successfully logged in! Welcome back, {user.display_name}</p>
	{/if}
</section>

<section>
	<h1 class="py-4 opacity-90 text-lg font-semibold">Authentication</h1>

	<HankoProfile />
</section>
