<script lang="ts">
	import { enhance } from '$app/forms'
	import AccountPanel from '$lib/Components/Auth/AccountPanel.svelte'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'
	import { addToast } from 'as-toast'

	export let data
	$: user = data.user
	$: stats = data.stats

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
	<header class="mb-6">
		<p class="section-eyebrow">Account</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Profile</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Manage how you appear to other players in the community.
		</p>
	</header>

	<form
		method="POST"
		class="card p-6 sm:p-8 space-y-1"
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
			message={usernameTaken ? 'Sorry! This username is already taken' : (errors.username ?? '')}
			on:change={checkUsernameTaken}
		/>

		<DataInput
			value={updated.bio}
			placeholder="I like spicy food and…"
			label="About you"
			name="bio"
			id="bio"
			type="textarea"
			invalid={Object.hasOwn(errors, 'bio')}
			message={errors.bio ?? ''}
		/>

		<div class="flex justify-end gap-2 pt-6">
			<button class="btn btn-ghost" type="button" on:click={() => resetForm()}>Cancel</button>
			<button class="btn btn-primary" type="submit">Save changes</button>
		</div>
	</form>
</section>

<section>
	<header class="mb-4">
		<p class="section-eyebrow">Stats</p>
		<h2 class="mt-1 text-xl font-semibold tracking-tight text-foreground">Match record</h2>
	</header>

	<StatsPanel {stats} heading="Your record" />
</section>

<section>
	<header class="mb-4">
		<p class="section-eyebrow">Security</p>
		<h2 class="mt-1 text-xl font-semibold tracking-tight text-foreground">Authentication</h2>
	</header>

	<div class="card p-6 sm:p-8">
		<AccountPanel />
	</div>
</section>
