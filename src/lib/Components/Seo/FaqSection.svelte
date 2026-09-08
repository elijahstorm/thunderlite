<script lang="ts">
	import type { FaqItem } from '$lib/Seo/faq'

	interface Props {
		items: FaqItem[]
		eyebrow?: string
		heading?: string
		/** Section id so the nav and any deep link can point at it. */
		id?: string
		/** Off when the caller already sits inside a `.container` (e.g. Casing). */
		contained?: boolean
	}

	let {
		items,
		eyebrow = 'SEC. 04 · Field questions',
		heading = 'Common questions',
		id = 'faq',
		contained = true,
	}: Props = $props()
</script>

<!--
	Answers are rendered open rather than tucked into a <details> accordion.
	Collapsed text is still crawled, but an answer engine extracting a quote does
	better with plain visible prose, and these answers are short enough that
	hiding them buys nothing.
-->
<section {id} class="py-14 lg:py-16" class:container={contained}>
	<p class="section-eyebrow">{eyebrow}</p>
	<h2 class="mt-2 text-3xl sm:text-4xl uppercase text-foreground">{heading}</h2>

	<dl class="mt-8 grid gap-x-10 lg:grid-cols-2 border-t border-border">
		{#each items as item (item.q)}
			<div class="py-5 border-b border-border">
				<dt class="text-base text-foreground">{item.q}</dt>
				<dd class="mt-2 text-sm text-foreground/75 leading-relaxed">{item.a}</dd>
			</div>
		{/each}
	</dl>
</section>
