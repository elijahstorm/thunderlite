import { onMount, afterUpdate, onDestroy } from 'svelte'

let timer

// Function to perform some action
function doSomething() {
	console.log('Timeout completed')

	// Your code here

	// Set the timer again
	timer = setTimeout(doSomething, 1000)
}

onMount(() => {
	// Initial setup when the component mounts
	timer = setTimeout(doSomething, 1000)

	// Cleanup when the component is destroyed
	onDestroy(() => {
		clearTimeout(timer)
	})
})

// Handle hot reloads gracefully
afterUpdate(() => {
	clearTimeout(timer)
	timer = setTimeout(doSomething, 1000)
})
