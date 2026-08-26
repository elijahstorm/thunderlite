// One <img> per sprite sheet, shared by every canvas on a dev page.
//
// The gallery pages put a hundred-odd canvases on screen at once and they nearly
// all draw the same sheet, so each one owning its own Image would mean a hundred
// decoded copies of it. `loaded` ticks when any sheet finishes downloading: read it
// inside a drawing effect and that effect re-runs once the art is actually there.
// Reading it is safe from inside an effect that also calls `sheetImage` — the cache
// means a second pass creates nothing and so writes nothing back.

const cache = new Map<string, HTMLImageElement>()

let loaded = $state(0)

/** Read inside a draw effect to have it re-run when a sheet arrives. */
export const sheetsLoaded = () => loaded

/** The sheet, or null while it is still downloading. */
export const sheetImage = (url: string): HTMLImageElement | null => {
	let image = cache.get(url)
	if (!image) {
		image = new Image()
		image.onload = () => (loaded += 1)
		image.src = url
		cache.set(url, image)
	}
	return image.complete && image.naturalWidth ? image : null
}
