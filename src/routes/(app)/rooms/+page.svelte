<script lang="ts">
	import type { PageData } from './$types'

	export let data: PageData
</script>

<section class="h-screen overflow-clip">
	<p>
		{data.user}
	</p>
	<p>
		{data.session}
	</p>
	<p>
		{data.gameData?.session}
	</p>
	<p>
		{data.gameData?.sha}
	</p>
</section>
