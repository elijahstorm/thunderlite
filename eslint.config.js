import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
	{
		ignores: [
			'.DS_Store',
			'node_modules/',
			'build/',
			'**/.svelte-kit/',
			'.vercel/',
			'package/',
			'test-results/',
			'src/lib/GameData/old/',
			'.env',
			'.env.*',
			'pnpm-lock.yaml',
			'package-lock.json',
			'yarn.lock',
		],
	},
	js.configs.recommended,
	...ts.configs['flat/recommended'],
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
			},
		},
		rules: {
			// TypeScript resolves identifiers (including ambient types from app.d.ts);
			// no-undef false-positives on them in svelte script blocks.
			'no-undef': 'off',
			// Bare store/prop references inside `$: { ... }` blocks are the legacy
			// reactive-dependency idiom used throughout this codebase.
			'no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
		},
	},
	{
		// Plain hrefs/goto() are fine here; this app doesn't use a configurable
		// base path. (Applies to .ts too — e.g. the Hanko auth redirects.)
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		// Pre-existing debt surfaced when lint was restored after the ESLint 9
		// migration. Downgraded to warnings so lint gates on new problems only —
		// promote back to errors as the code is cleaned up.
		rules: {
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/ban-ts-comment': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'no-useless-assignment': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/infinite-reactive-loop': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn',
			'svelte/no-reactive-reassign': 'warn',
			'svelte/require-store-reactive-access': 'warn',
			'svelte/no-immutable-reactive-statements': 'warn',
		},
	},
]
