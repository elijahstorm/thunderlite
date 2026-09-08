<script lang="ts">
	import type { ResolvedSeo } from '$lib/Seo/seo'
	import { SITE_NAME, SITE_URL } from '$lib/Seo/seo'
	import { graph } from '$lib/Seo/jsonLd'

	interface Props {
		seo: ResolvedSeo
		/** Optional extra stylesheet the KV site:config can inject. */
		googleFonts?: string
	}

	let { seo, googleFonts = '' }: Props = $props()

	// Every `<` is escaped so a map name or description containing a closing
	// script tag cannot break out and inject markup. JSON-LD parsers read the
	// < escape as a plain `<`, so the structured data is unaffected.
	const ldScript = $derived.by(() => {
		if (!seo.jsonLd.length) return ''
		const json = JSON.stringify(graph(seo.jsonLd)).split('<').join('\\u003c')
		return `<script type="application/ld+json">${json}<` + `/script>`
	})
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="robots" content={seo.robots} />
	<link rel="canonical" href={seo.canonical} />

	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content={seo.type} />
	<meta property="og:title" content={seo.title} />
	<meta property="og:description" content={seo.description} />
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:alt" content="A ThunderLite battle in progress" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:locale" content="en_US" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seo.title} />
	<meta name="twitter:description" content={seo.description} />
	<meta name="twitter:image" content={seo.image} />

	<link rel="sitemap" type="application/xml" href="{SITE_URL}/sitemap.xml" />

	{#if ldScript}
		<!-- Safe by construction: ldScript is JSON.stringify output with every `<`
		     escaped above, so no user-supplied map name or description can close
		     the tag or open another one. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html ldScript}
	{/if}

	{#if googleFonts}
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
		<link href={googleFonts} rel="stylesheet" />
	{/if}
</svelte:head>
