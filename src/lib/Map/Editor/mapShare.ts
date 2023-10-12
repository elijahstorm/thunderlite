import { PUBLIC_URL } from '$env/static/public'
import { addToast } from 'as-toast'

export const share = (title: string, text: string, hash: string) => {
	const url = `${PUBLIC_URL}editor/${hash}`

	if (navigator.share) {
		const shareData = {
			title,
			text,
			url,
		}

		navigator
			.share(shareData)
			.then(() => {
				addToast('Shared successfully')
			})
			.catch((error) => {
				addToast(`Error sharing: ${error}`, 'warn')
			})
	} else {
		const tempInput = document.createElement('input')
		tempInput.value = url
		document.body.appendChild(tempInput)
		tempInput.select()
		document.execCommand('copy')
		document.body.removeChild(tempInput)
		addToast('Copied link to clipboard')
	}
}
