<script lang="ts">
	import { page } from '$app/stores'
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import { supportData } from './(marketing)/support/+page.svelte'

	$: supportData.set({
		subject: `User Error Report - ${$page.status}`,
		message: `\n\nPage: ${$page.url}\n\nError: ${$page.status} - ${
			$page.error?.message
		}.\n\nTime: ${new Date().toLocaleString()}\n\n`,
	})
</script>

<ContentWithFooter>
	<Casing>
		<section class="flex flex-col items-center pt-8">
			<div class="max-w-lg space-y-6">
				<p class="text-center text-lg">
					<span class="font-bold text-xl">
						{$page.status}:
					</span>
					{$page.error?.message}
				</p>

				<p>
					<span> If this is a problem with the site, </span>

					<a
						href="/support"
						class="border-transparent border-b-2 text-blue-600 transition-colors hover:border-blue-600 focus:border-blue-600"
					>
						you can report the issue here
					</a>

					<span class="-ml-1"> . </span>
				</p>

				<FallbackImage alt={`${$page.status}, ${$page.error?.message}`} />
			</div>
		</section>
	</Casing>
</ContentWithFooter>
