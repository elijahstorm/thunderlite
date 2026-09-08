<script lang="ts">
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import LandingPage from '$lib/Components/PageContainers/LandingPage.svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import FaqSection from '$lib/Components/Seo/FaqSection.svelte'
	import { HOME_FAQ } from '$lib/Seo/faq'
</script>

<ContentWithFooter>
	<Header />
	<LandingPage />
	<FaqSection items={HOME_FAQ} />
</ContentWithFooter>
