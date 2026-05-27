<script lang="ts">
	import { page } from '$app/stores'
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import { supportData } from './(marketing)/support/+page.svelte'
	import Icon from '@iconify/svelte'

	$: supportData.set({
		subject: `User Error Report - ${$page.status}`,
		message: `\n\nPage: ${$page.url}\n\nError: ${$page.status} - ${
			$page.error?.message
		}.\n\nTime: ${new Date().toLocaleString()}\n\n`,
	})
</script>

<ContentWithFooter>
	<Casing>
		<section class="flex flex-col items-center text-center max-w-lg mx-auto py-12 space-y-6">
			<div
				class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground"
			>
				<Icon icon="lucide:triangle-alert" width={24} />
			</div>
			<div class="space-y-2">
				<p class="section-eyebrow">Error {$page.status}</p>
				<h1 class="text-3xl font-semibold tracking-tight text-foreground">
					{$page.error?.message ?? 'Something went wrong'}
				</h1>
				<p class="text-muted-foreground">
					We hit a snag loading this page. You can head back home, or let us know if it keeps
					happening.
				</p>
			</div>
			<div class="flex items-center gap-3 pt-2">
				<a class="btn btn-primary" href="/">
					<Icon icon="lucide:arrow-left" width={16} />
					Back to home
				</a>
				<a class="btn btn-outline" href="/support">Report the issue</a>
			</div>
		</section>
	</Casing>
</ContentWithFooter>
