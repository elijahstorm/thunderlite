// import { PUBLIC_URL } from '$env/static/public'
import { addToast } from 'as-toast'

export const share = (title: string, text: string, hash: string) => {
	if (navigator.share) {
		// Share API is supported
		const shareData = {
			title,
			text,
			url: `${'PUBLIC_URL'}map/${hash}`,
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
		// Share API is not supported
		addToast('Share API is not available in this browser', 'warn')
	}
}
