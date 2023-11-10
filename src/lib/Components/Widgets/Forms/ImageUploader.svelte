<script lang="ts">
	import FallbackImage from '$lib/Components/Widgets/Images/FallbackImage.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import ImageGradientOverlay from '$lib/Components/Widgets/Helpers/ImageGradientOverlay.svelte'
	import Icon from '@iconify/svelte'
	import { addToast } from 'as-toast'

	const fallback = 'https://cdn4.iconfinder.com/data/icons/small-n-flat/24/user-alt-512.png'

	export let src: string = fallback
	export let alt: string
	export let dest: string = 'picture'
	export let title: string | undefined = undefined
	export let oncomplete: () => void = () => {}

	const accept = '.jpg, .jpeg, .png, .svg'
	const icon = 'akar-icons:cloud-upload'
	const failedIcon = 'akar-icons:triangle-alert-fill'
	const finishedIcon = 'ic:round-cloud-done'
	const width = '3rem'

	let fileinput: HTMLInputElement
	let fileName = ''
	let fileType = ''
	let errorMssage: string
	let state: 'ready' | 'uploading' | 'finished' | 'failed' = 'ready'

	$: {
		if (src) {
			fileName =
				decodeURIComponent(src).split('/').pop()?.split('?').shift() ?? 'ERROR GETTING NAME'
			fileType = `.${src.split('.').pop()?.split('?').shift() ?? 'unknown'}`
		}
	}

	const onFileSelected = async (e) => {
		const blob = e.target.files[0]

		const reader = new FileReader()
		reader.readAsDataURL(blob)
		reader.onload = (e) => {
			src = fileinput.result as string
		}

		state = 'uploading'

		try {
			// await
			addToast('Image uploaded')
			state = 'finished'
			oncomplete()
		} catch (e) {
			state = 'failed'
			if (e instanceof Error) {
				errorMssage = e.message
			} else if (typeof e !== 'string') {
				errorMssage = `${e}`
			} else {
				errorMssage = e ?? 'Unknown error'
			}
		}
	}

	const open = () => {
		fileinput.click()
	}
</script>

<section class="flex items-center justify-center flow-c">
	<button
		class="image-uploader-container w-full overflow-clip text-left rounded-lg relative cursor-pointer grid grid-cols-1 grid-rows-1 border border-gray-400 max-h-96 transition-all"
		on:click={open}
	>
		<FallbackImage {src} {alt} {fallback} />

		<ImageGradientOverlay title={title ?? `Your ${dest}`} info={''} {fileType} {fileName} {state} />

		<div
			class="upload-interation-icon cursor-pointer z-10 opacity-0 transition-opacity duration-500 bg-white p-4 m-4 border border-gray-300 rounded-full"
			class:opacity-100={state != 'ready'}
		>
			{#if state == 'ready'}
				<Icon {icon} {width} />
			{:else if state == 'uploading'}
				<Loader />
			{:else if state == 'failed'}
				<Icon icon={failedIcon} {width} color={'var(--error)'} />
				<div class="flex flex-col items-center">
					<p
						class="absolute mt-8 py-2 px-4 text-red-500 bg-red-100 rounded-lg border border-red-500"
					>
						{status}
					</p>
				</div>
			{:else if state == 'finished'}
				<Icon icon={finishedIcon} {width} color={'var(--primary)'} />
			{/if}
		</div>
	</button>

	<input class="hidden" type="file" {accept} on:change={onFileSelected} bind:this={fileinput} />
</section>

<style>
	:global(.image-uploader-container > *) {
		grid-row: 1;
		grid-column: 1;
		align-self: center;
		justify-self: center;
	}

	.image-uploader-container:is(:focus, :hover) .upload-interation-icon {
		opacity: 1;
	}
</style>
