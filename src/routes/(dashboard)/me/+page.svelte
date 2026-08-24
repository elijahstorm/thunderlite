<script lang="ts">
	import { untrack } from 'svelte'
	import { enhance } from '$app/forms'
	import AccountPanel from '$lib/Components/Auth/AccountPanel.svelte'
	import DataInput from '$lib/Components/Widgets/Forms/DataInput.svelte'
	import ImageUploader from '$lib/Components/Widgets/Forms/ImageUploader.svelte'
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'
	import MatchHistoryList from '$lib/Components/Profile/MatchHistoryList.svelte'
	import { addToast } from 'as-toast'

	let { data, form } = $props()

	// Local working copy of the profile: seeded from the server user, kept in sync as
	// the server value changes, but preserving in-progress edits (hence the self-merge,
	// which a plain writable `$derived` can't express).
	// eslint-disable-next-line svelte/prefer-writable-derived
	let updated: UserDBData = $state(untrack(() => data.user))

	let usernameTaken = $state(false)

	const resetForm = (data = {}) => (updated = { ...(user ?? {}), ...data })

	const checkUsernameTaken = (e: Event) => {
		const value = (e.target as HTMLInputElement)?.value
		return (
			value &&
			fetch(`/api/user/exists/${value}`)
				.then((response) => response.json())
				.then((data) => (usernameTaken = data.exists?.length))
		)
	}

	let user = $derived(data.user)
	let stats = $derived(data.stats)
	let eloHistory = $derived(data.eloHistory)
	// Re-merge server fields into the working copy when the server user changes,
	// preserving in-progress local edits. Depends only on `user`; `updated` is read
	// untracked so a local edit doesn't re-trigger the merge (which would loop).
	$effect.pre(() => {
		updated = { ...(user ?? {}), ...untrack(() => updated ?? {}) }
	})
	const errors: { [key: string]: string } = $derived(
		Object.entries(form?.errors ?? {}).reduce(
			(carry, [dataName, e]) => ({ ...carry, [dataName]: (e as string[])[0] }),
			{} as { [key: string]: string }
		)
	)
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
			onchange={checkUsernameTaken}
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
			<button class="btn btn-ghost" type="button" onclick={() => resetForm()}>Cancel</button>
			<button class="btn btn-primary" type="submit">Save changes</button>
		</div>
	</form>
</section>

<section>
	<header class="mb-4">
		<p class="section-eyebrow">Stats</p>
		<h2 class="mt-1 text-xl font-semibold tracking-tight text-foreground">Match record</h2>
	</header>

	<StatsPanel {stats} history={eloHistory} heading="Your record" />
</section>

{#if data.recentGames?.length}
	<section>
		<header class="mb-4 flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="section-eyebrow">Battle log</p>
				<h2 class="mt-1 text-xl font-semibold tracking-tight text-foreground">Recent games</h2>
			</div>
			<a class="link text-sm" href="/my/games">View all {data.totalGames}</a>
		</header>

		<MatchHistoryList entries={data.recentGames} />
	</section>
{/if}

<section>
	<header class="mb-4">
		<p class="section-eyebrow">Security</p>
		<h2 class="mt-1 text-xl font-semibold tracking-tight text-foreground">Authentication</h2>
	</header>

	<div class="card p-6 sm:p-8">
		<AccountPanel />
	</div>
</section>
