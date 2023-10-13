/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}',
	],

	plugins: [require('flowbite/plugin')],

	darkMode: 'class',

	theme: {
		extend: {
			fontFamily: 'Roboto, sans-serif',
			colors: {
				primary: {
					'dark-blue': 'hsl(233, 26%, 24%)',
					'lime-green': '#59e5c3',
					'bright-cyan': 'hsl(192, 70%, 51%)',
				},
				neutral: {
					'grayish-blue': 'hsl(233, 8%, 62%)',
					'light-grayish-blue': 'hsl(220, 16%, 96%)',
					'very-light-gray': 'hsl(0, 0%, 98%)',
					white: 'hsl(0, 0%, 100%)',
				},
				black: '#000000',
				white: '#f8f9fa',
				brand: {
					50: '#afdafd',
					100: '#9cd1fc',
					200: '#88c8fc',
					300: '#74befb',
					400: '#60b5fb',
					500: '#41a7fa',
					600: '#38a3fa',
					700: '#2499f9',
					800: '#1090f9',
					900: '#0986ef',
				},
			},
			backgroundImage: () => ({
				'header-desktop': "url('/images/bg-intro-desktop.svg')",
				'header-mobile': "url('/images/bg-intro-mobile.svg')",
				'image-mockups': "url('/images/image-mockups.png')",
			}),
			backgroundSize: {
				'custom-mobile-header-size': '100% 50%',
				'custom-mobile-mockup-size': 'auto 60%',
			},
			container: {
				center: true,
				padding: {
					DEFAULT: '1.25rem',
					sm: '2rem',
					lg: '3rem',
					xl: '4rem',
					'2xl': '5rem',
				},
			},
			inset: {
				'-42.6%': '-42.6%',
			},
		},
	},
}
