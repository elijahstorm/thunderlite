<script lang="ts">
	import HorizontalUserCard from "$lib/Components/Content/User/HorizontalUserCard.svelte"
	import type { UserContentConfig } from "$lib/Components/Content/User/UserContent"
	import UserIdsToContent from "$lib/Components/Content/User/UserIdsToContent.svelte"
	import { myId } from "$lib/firebase/auth"
	import UserSearch from "$lib/Components/Content/User/UserSearch.svelte"
	import Loader from "../Helpers/Loader.svelte"

	let users: string[]

	export let updatedUsersList: string[] = []
	export let owner: string
	export const getUpdatedUserList = () => users

	$: users = [...updatedUsersList]

	const add = (user: UserContentConfig) => () => {
		users = [...users, user.id]
	}

	const remove = (user: UserContentConfig) => () => {
		const index = users.findIndex((u) => u === user.id)

		if (~index) {
			users.splice(index, 1)
			users = [...users]
		}
	}
</script>

<div class="flex flex-col items-start gap-3">
	<UserSearch select={add} exclude={users} />

	<div class="flex flex-col gap-3 w-full">
		<UserIdsToContent {users} let:user>
			{#if typeof user !== "string"}
				<HorizontalUserCard {user}>
					{#if user.id !== myId() && user.id !== owner}
						<button class="btn-alert" on:click={remove(user)}>
							<svg
								class="h-5 w-5"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>

							<span class="ml-2 hidden sm:block"> Remove </span>
						</button>
					{:else if user.id === owner}
						<span class="opacity-70 text-xs px-8 italic">(Owner)</span>
					{:else}
						<span class="opacity-70 text-xs px-8 italic">(Me)</span>
					{/if}
				</HorizontalUserCard>
			{/if}

			<div slot="loading">
				<Loader size={3} />
			</div>

			<div slot="error" let:id>
				<div class="rounded-full w-12 h-12 bg-red-300" />

				<span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-red-300">
					error {id}
				</span>
			</div>
		</UserIdsToContent>
	</div>
</div>
