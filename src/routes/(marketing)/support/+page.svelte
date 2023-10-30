<script lang="ts" context="module">
	import { writable } from 'svelte/store'

	export const supportData = writable({
		subject: '',
		message: '',
	})
</script>

<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContactForm from '$lib/Components/Widgets/Forms/ContactForm.svelte'
</script>

<Casing>
	<ContactForm
		type="support"
		title="Report an Issue"
		prompt="To create a request ticket, contact us directly with this form."
		prefill={$supportData}
	/>
</Casing>
