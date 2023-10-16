<script lang="ts">
	import Casing from "$lib/Components/PageContainers/Casing.svelte"
</script>

<Casing logoLink={"/login"}>
	<div class="flex flex-col gap-8 py-4">
		<div class="text-center py-2">
			<a
				class="text-3xl text-brand-500 font-bold no-underline transition border-transparent border-b-4 hover:border-b-brand-500"
				href="/login">Let's Do Together — Today!</a
			>
		</div>

		<p class="indent-8 text-gray-600">
			A cross-platform, sharable todo app powered up by the creation of teams and groups of
			friends to work together to accomplish common goals — or just to plan a fun day at the
			park. Haja uses simplicity to feel organic, and fun and extremely easy to use!
		</p>

		<p class="indent-8">
			Haja [하자] means "Let's do it together" in Korean. During my time in Korea, I was
			really impacted by how beautiful their systems are. From the language, to architecture,
			to media and tech design. There is so much uniquness that can be felt in the designs of
			South Korea. It can best be described as Elegant Simplicity. I wanted to try and capture
			that sense of grandeur in simplicity. Under the hood, making a product that feels simple
			and elegant might require a lot of complexities and a lot of necessary abstractions.
		</p>

		<p class="indent-8 text-gray-600">
			Hop in via the phone app, or just dive in the browser. Share your personal todo list, or
			keep it private. You can combine your efforts on a collabrative team to help you track
			with your friends what is getting done. You can keep track of all the requirements on a
			school project, or organize a fund raiser, or plan a picnic and figure out what still
			needs to be bought!
		</p>
	</div>
</Casing>
