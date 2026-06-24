import { addToast } from 'as-toast'

export const share = async (name: string, encoded: string, thumbnail: string) => {
	let sha: string | undefined
	try {
		const response = await fetch(`/api/upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-sveltekit-action': 'true',
			},
			body: JSON.stringify({
				name,
				encoded,
				thumbnail,
			}),
		})

		const data = await response.json().catch(() => null)

		// Bail before building a link if the upload failed — otherwise we'd share
		// a bogus `/editor/undefined` URL (the symptom of a rejected insert).
		if (!response.ok || !data?.sha) {
			addToast(data?.message ?? 'Could not publish map.', 'warn')
			return
		}
		sha = data.sha
	} catch (error) {
		addToast(`Error generating map file. ${error}`, 'warn')
		return
	}

	// Absolute URL so the shared/copied link works when pasted anywhere, not just
	// when already on the site. Recipients land on the map's view/play page rather
	// than the authoring editor.
	const url = new URL(`/map/${sha}`, window.location.origin).href

	if (navigator.share) {
		try {
			await navigator.share({ title: name, text: 'A game!', url })
			addToast('Shared successfully')
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return
			addToast(`Error sharing: ${error}`, 'warn')
		}
		return
	}

	try {
		await navigator.clipboard.writeText(url)
	} catch {
		const tempInput = document.createElement('input')
		tempInput.value = url
		document.body.appendChild(tempInput)
		tempInput.select()
		document.execCommand('copy')
		document.body.removeChild(tempInput)
	}
	addToast('Copied link to clipboard')
}
