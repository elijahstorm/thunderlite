import { addToast } from 'as-toast'

const app = {
	file: {
		handle: null as FileSystemFileHandle | null,
	},
	modified: false,
	map: {
		title: 'Unnamed Map',
	},
}

// File System Access API isn't on the standard lib types yet — narrow access
// through a tiny structural type so we don't sprinkle `any` around the module.
type SaveFilePicker = (options: {
	suggestedName?: string
	types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<FileSystemFileHandle>
const showSaveFilePicker = (): SaveFilePicker | undefined =>
	(window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker

export const save = async (content: string) => {
	if (!app.file.handle) {
		return await saveFileAs(content)
	}
	await writeFile(app.file.handle, content)
	app.modified = false
}

export const open = (callback: (content: string | null) => void) => {
	// Input element to select a file
	const fileInput = document.createElement('input')
	fileInput.type = 'file'

	// Listen for the 'change' event when a file is selected
	fileInput.addEventListener('change', function () {
		const selectedFile = fileInput.files?.[0]

		if (selectedFile) {
			const reader = new FileReader()

			// Define a callback function to handle the file content
			reader.onload = function (event) {
				const result = event.target?.result
				callback(typeof result === 'string' ? result : null)
			}

			// Read the file as text
			reader.readAsText(selectedFile)
		} else {
			addToast('No file selected.', 'warn')
		}
	})

	// Trigger the file input dialog
	fileInput.click()
}

const getNewFileHandle = async (): Promise<FileSystemFileHandle | null> => {
	const picker = showSaveFilePicker()
	if (!picker) return null
	return picker({
		suggestedName: app.map?.title,
		types: [
			{
				description: 'Text file',
				accept: { 'text/plain': ['.txt'] },
			},
		],
	})
}

// Browsers without File System Access (Firefox, Safari) fall through to a
// regular anchor download so saving still works — no DB or handle to remember,
// but the user gets the file. Chromium picks the real picker via `getNewFileHandle`.
const downloadFallback = (textContent: string) => {
	const blob = new Blob([textContent], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${app.map?.title ?? 'thunderlite'}.txt`
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

const saveFileAs = async (textContent: string) => {
	let fileHandle: FileSystemFileHandle | null = null
	try {
		fileHandle = await getNewFileHandle()
	} catch (ex) {
		if (ex instanceof Error && ex.name === 'AbortError') {
			return
		}
		const msg = 'An error occured trying to open the file.'
		addToast(`${msg}, ${ex}`, 'warn')
		alert(msg)
		return
	}
	if (!fileHandle) {
		// No native picker available — degrade to an anchor download.
		downloadFallback(textContent)
		return
	}
	try {
		await writeFile(fileHandle, textContent)
		app.file.handle = fileHandle
		app.modified = false
	} catch (ex) {
		const msg = 'Unable to save file.'
		addToast(`${msg}, ${ex}`, 'warn')
		alert(msg)
		return
	}
}

const writeFile = async (fileHandle: FileSystemFileHandle, contents: string) => {
	// Create a FileSystemWritableFileStream to write to.
	const writable = await fileHandle.createWritable()
	// Write the contents of the file to the stream.
	await writable.write(contents)
	// Close the file and write the contents to disk.
	await writable.close()
}
