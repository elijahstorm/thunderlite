import { PUBLIC_URL } from '$env/static/public'
import { addToast } from 'as-toast'
import { hash } from './mapEncrypter'

export const share = (title: string, text: string, encoded: string) =>
	hash(encoded)((mapHash) => {
		const url = `${PUBLIC_URL}editor/${mapHash}`

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
	})
