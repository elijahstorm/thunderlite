const originalImage = document.getElementById('originalImage')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

// Set canvas size to match the image
canvas.width = originalImage.width
canvas.height = originalImage.height

// Draw the original image onto the canvas
ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height)

// Replace white color with red (you can change the colors as needed)
const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
for (let i = 0; i < imgData.data.length; i += 4) {
	if (imgData.data[i] === 255 && imgData.data[i + 1] === 255 && imgData.data[i + 2] === 255) {
		imgData.data[i] = 255 // Red
		imgData.data[i + 1] = 0 // Green
		imgData.data[i + 2] = 0 // Blue
	}
}
ctx.putImageData(imgData, 0, 0)

// Convert canvas back to an image URL
const newImageUrl = canvas.toDataURL('image/jpeg')

// Display the modified image
const newImage = new Image()
newImage.src = newImageUrl
document.body.appendChild(newImage)
