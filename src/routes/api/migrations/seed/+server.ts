import { error } from '@sveltejs/kit'
import { faker, migrate, resetTables } from '$lib/Database/Migrations/migrator'
import { json } from '@sveltejs/kit'
import { makeUserDBDataFromAuth, updateUserDBData } from '$lib/Database/getUserData.js'

export const GET = async ({ locals }) => {
	const auth = locals.user
	if (!auth) error(403, 'You are not logged in');
	let status

	try {
		await resetTables(locals.sql)
		await migrate(locals.sql)
		await makeUserDBDataFromAuth(auth)(locals.sql)
		await updateUserDBData(
			auth,
			{
				profile_image_url: `https://mqedwo0pwcfqxoiz.public.blob.vercel-storage.com//user-images/AIpjHJNrrpJbHwXQ-NHhwsrBg39fI08gUUUTpTWPoE4Ruug`,
				bio: 'this is the day we win',
				username: 'super_hero',
				display_name: 'this is the day we win forever',
			} as UserDBData,
			['profile_image_url', 'bio', 'username', 'display_name']
		)(locals.sql)
		status = await faker(locals.sql, auth)
	} catch (e) {
		console.error(e)
		error(500, 'failed to run migrations');
	}

	return json(status)
}
