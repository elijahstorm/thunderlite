<script lang="ts">
	import type { ChangeEventHandler } from 'svelte/elements'
	import FallbackImage from '$lib/Components/Widgets/Images/FallbackImage.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import ImageGradientOverlay from '$lib/Components/Widgets/Helpers/ImageGradientOverlay.svelte'
	import Icon from '@iconify/svelte'
	import { addToast } from 'as-toast'

	const fallback = 'https://cdn4.iconfinder.com/data/icons/small-n-flat/24/user-alt-512.png'

	interface Props {
		auth: string
		src?: string
		alt: string
		dest?: string
		title?: string | undefined
		oncomplete?: () => void
	}

	let {
		auth,
		src = $bindable(fallback),
		alt,
		dest = 'picture',
		title = undefined,
		oncomplete,
	}: Props = $props()

	const accept = '.jpg, .jpeg, .png, .svg'
	const icon = 'akar-icons:cloud-upload'
	const failedIcon = 'akar-icons:triangle-alert-fill'
	const finishedIcon = 'ic:round-cloud-done'
	const width = '3rem'

	let fileinput = $state<HTMLInputElement>()
	let fileName = $state('')
	let fileType = $state('')
	let errorMessage = $state('')
	let uploadState = $state<'ready' | 'uploading' | 'finished' | 'failed'>('ready')

	const onFileSelected: ChangeEventHandler<HTMLInputElement> = async (event) => {
		const blob = (<HTMLInputElement>event.target)?.files?.item(0)
		if (!blob) return
		const reader = new FileReader()
		reader.readAsDataURL(blob)
		reader.onload = () => {
			src = reader.result?.toString() ?? ''
		}
		uploadState = 'uploading'

		try {
			const { url } = await (
				await fetch(`/api/user/${auth}/image`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-sveltekit-action': 'true',
					},
					body: blob,
				})
			).json()
			src = url
			uploadState = 'finished'
			addToast('Image uploaded')
			oncomplete?.()
		} catch (e) {
			uploadState = 'failed'
			if (e instanceof Error) {
				errorMessage = e.message
			} else if (typeof e !== 'string') {
				errorMessage = `${e}`
			} else {
				errorMessage = e ?? 'Unknown error'
			}
		}
	}

	const open = () => fileinput?.click()

	$effect(() => {
		if (src) {
			fileName =
				decodeURIComponent(src).split('/').pop()?.split('?').shift() ?? 'ERROR GETTING NAME'
			fileType = `.${src.split('.').pop()?.split('?').shift() ?? 'unknown'}`
		}
	})
</script>

<section class="flex items-center justify-center flow-c">
	<button
		class="image-uploader-container w-full overflow-clip text-left rounded-lg relative cursor-pointer grid grid-cols-1 grid-rows-1 border border-gray-400 max-h-96 transition-all"
		onclick={open}
	>
		<FallbackImage {src} {alt} {fallback} />

		<ImageGradientOverlay
			title={title ?? `Your ${dest}`}
			info=""
			{fileType}
			{fileName}
			state={uploadState}
		/>

		<div
			class="upload-interation-icon cursor-pointer z-10 opacity-0 transition-opacity duration-500 bg-white p-4 m-4 border border-gray-300 rounded-full"
			class:opacity-100={uploadState != 'ready'}
		>
			{#if uploadState == 'ready'}
				<Icon {icon} {width} />
			{:else if uploadState == 'uploading'}
				<Loader />
			{:else if uploadState == 'failed'}
				<Icon icon={failedIcon} {width} color="var(--error)" />
				<div class="flex flex-col items-center">
					<p
						class="absolute mt-8 py-2 px-4 text-red-500 bg-red-100 rounded-lg border border-red-500"
					>
						{uploadState}
					</p>
				</div>
			{:else if uploadState == 'finished'}
				<Icon icon={finishedIcon} {width} color="var(--primary)" />
			{/if}
		</div>
	</button>

	<input class="hidden" type="file" {accept} onchange={onFileSelected} bind:this={fileinput} />
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
