import { addToast } from 'as-toast'

export const share = async (name: string, encoded: string) =>
	fetch(`/api/upload`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-sveltekit-action': 'true',
		},
		body: JSON.stringify({
			name,
			encoded,
		}),
	})
		.then((response) => response.json())
		.then((data) => {
			const { sha } = data
			const url = `/editor/${sha}`

			if (navigator.share) {
				const shareData = {
					title: name,
					text: 'A game!',
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
		.catch((error) => addToast(`Error generating map file. ${error}`, 'warn'))
