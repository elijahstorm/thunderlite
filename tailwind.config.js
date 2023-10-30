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
					50: '#C5E6FC',
					100: '#9ED5FA',
					200: '#77C4F8',
					300: '#3DFBFA',
					400: '#169BF3',
					500: '#0A78C2',
					600: '#096CAE',
					700: '#075488',
					800: '#042f4b',
					900: '#021827',
				},
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
