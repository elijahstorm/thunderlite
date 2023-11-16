export const validate = (data: FormData, validators: { [key: string]: string }) => {
	const errors: { [key: string]: string[] } = {}
	const validated: { [key: string]: unknown } = {}

	Object.entries(validators).map(([dataName, validator]) => {
		const entry = data.get(dataName)?.toString()
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
