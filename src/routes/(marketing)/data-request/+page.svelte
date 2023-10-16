<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContactForm from '$lib/Components/Widgets/Forms/ContactForm.svelte'
</script>

<Casing>
	<ContactForm
		type="data-request"
		title="Data Request"
		prompt="To request your personal data, fill out this form."
	/>
</Casing>
