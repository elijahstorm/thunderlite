import {
	getUserDBDataFromAuth,
	makeUserDBDataFromAuth,
	updateUserDBData,
} from '$lib/Database/getUserData'
import { error, fail } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	let user: UserDBData | null = null

	try {
		user = await getUserDBDataFromAuth(locals.user)(locals.sql)
	} catch (e) {
		await makeUserDBDataFromAuth(locals.user)(locals.sql)
		user = {
			id: -1,
			username: '',
			display_name: '',
			profile_image_url: '',
			bio: '',
			created_at: new Date(),
		}
	}

	return { user }
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(403, {})

		const rules = {
			username: 'required|string|noWhitespace|max:20|min:5',
			display_name: 'required|string|max:30|min:5',
			bio: 'string|max:1000',
		}

		const { validated, errors } = validate(await request.formData(), rules)

		if (Object.keys(errors).length > 0) return fail(400, { errors })

		await updateUserDBData(
			locals.user,
			validated as UserDBData,
			Object.keys(validated) as (keyof UserDBData)[]
		)(locals.sql)

		return {
			validated,
			errors,
		}
	},
}

const validate = (data: FormData, validators: { [key: string]: string }) => {
	const errors: { [key: string]: string[] } = {}
	const validated: { [key: string]: unknown } = {}

	Object.entries(validators).map(([dataName, validator]) => {
		const entry = data.get(dataName) as string | undefined
		const rules = validator.split('|')
		rules.map((rule) => {
			const [action, ...args] = rule.split(':')
			if (!Object.hasOwn(Validators, action)) return
			if (!Validators[action as keyof typeof Validators](entry, args[0])) {
				errors[dataName] = [
					...(errors[dataName] ?? []),
					`Oops! Your ${dataName} ${Messages[action as keyof typeof Validators](args[0])}`,
				]
			}
		})
		validated[dataName] = entry
	})

	return { validated, errors }
}

const required = (entry: unknown) => entry && entry !== null && typeof entry !== 'undefined'
const string = (entry: unknown) => typeof entry === 'string'
const noWhitespace = (entry: unknown) => (typeof entry === 'string' ? !/\s/.test(entry) : true)
const max = (entry: unknown, max: string) =>
	typeof entry === 'string'
		? entry.length < parseInt(max)
		: typeof entry === 'number'
		? entry < parseInt(max)
		: false
const min = (entry: unknown, min: string) =>
	typeof entry === 'string'
		? entry.length > parseInt(min)
		: typeof entry === 'number'
		? entry > parseInt(min)
		: false

const Validators = {
	required,
	string,
	noWhitespace,
	max,
	min,
} as const

const Messages = {
	required: () => 'is missing',
	string: () => 'should be a string',
	noWhitespace: () => 'should not have any whitespace',
	max: (max: string) => `cannot be more than ${max} characters`,
	min: (min: string) => `cannot be less than ${min} characters`,
} as const
