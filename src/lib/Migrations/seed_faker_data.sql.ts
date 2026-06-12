import { db } from '$lib/Server/dontcode'

/**
 * Dev-only demo data, ported from the old raw-SQL seed to `db.insert` calls.
 * Serial ids are no longer assumed: each parent insert's returned id is used
 * for the child rows' foreign keys.
 */
export const CreateDemoData = async (user: string) => {
	const mapTypeIds: unknown[] = []
	for (const text of ['abc', 'xyz', 'something bigger']) {
		mapTypeIds.push((await db.insert('map_types', { text })).id)
	}

	const infoIds: unknown[] = []
	for (const [info, color] of [
		['new info', 'red'],
		['another info', 'blue'],
	]) {
		infoIds.push((await db.insert('info', { info, color })).id)
	}

	const profiles: [string, string, string, string, string][] = [
		[
			'037d146b-0729-4781-9422-46c9d5ed91de',
			'https://picsum.photos/id/242/200/200',
			'my_name',
			'stage 4 cancer',
			'i have doods all over me',
		],
		[
			'e7955b19-4aa7-46dc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/425/200/200',
			'healthy_angel',
			'big BOY FOREVER',
			'dude that was scary',
		],
		[
			'a',
			'https://picsum.photos/id/54/200/200',
			'thailand',
			'Thai Guy',
			'I only ever went there one time',
		],
		['b', 'https://picsum.photos/id/25/200/200', 'jamie', 'Jame Cordon', 'ya thats me'],
		['c', 'https://picsum.photos/id/42/200/200', 'atroic', 'coffee cow', 'i am not a coffee cow'],
		['d', 'https://picsum.photos/id/48/200/200', 'dougdoug', 'Doug', 'dougdougdougdoug'],
		['e', 'https://picsum.photos/id/120/200/200', 'babichana', 'Anna Kim', 'im a good girl :)'],
		['f', 'https://picsum.photos/id/930/200/200', 'elijahstorm', 'Elijah Storm', 'hey!'],
		[
			'g',
			'https://picsum.photos/id/17/200/200',
			'reallylongname',
			'Text that is long',
			'Text that is even longer because we really want to test the system because we need to make sure that everything looks good even when at the upper limits of what it can display.',
		],
		['h', 'https://picsum.photos/id/32/200/200', 'a', 'A', 'az'],
		[
			'e7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/181/200/200',
			'angry_boil',
			'Angers',
			'emojis forever',
		],
	]
	for (const [auth, profile_image_url, username, display_name, bio] of profiles) {
		await db.insert('profiles', { auth, profile_image_url, username, display_name, bio })
	}

	const maps: [string, string, string, string, string, number, string, number, string][] = [
		[
			'onetwothree',
			'https://picsum.photos/id/3/200/200',
			'http://localhost:8080/?pgsql=db&username=postgres&db=postgres&ns=public&edit=maps',
			'name',
			'this is a description',
			1,
			'public',
			3252,
			'037d146b-0729-4781-9422-46c9d5ed91de',
		],
		[
			'x-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/22/200/200',
			'e7955b19-4aa7-afbe55a2893a',
			'not the last one at all ',
			'first one',
			1,
			'public',
			24,
			'e7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
		],
		[
			'1-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/33/200/200',
			'e7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'Battle Ground ',
			'Its almost like this is a real map name',
			1,
			'public',
			24,
			'a',
		],
		[
			'fsdgsd-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/66/200/200',
			'e7955b19-4aa7-52rzc--afbe55a2893a',
			'Time Stopper ',
			'show stopper',
			1,
			'public',
			24,
			'b',
		],
		[
			'-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/55/200/200',
			'e7955b19-4aa7-52rzc--afbe55a2893a',
			'Regaurdless ',
			'im the hottest',
			2,
			'public',
			24,
			'c',
		],
		[
			'e-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/88/200/200',
			'e7955b19-4aa7--a0dc-afbe55a2893a',
			'Dont have hope ',
			'just do coke',
			2,
			'public',
			24,
			'd',
		],
		[
			'7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/77/200/200',
			'e7955b19-4aa7-52rzc-a0dc-',
			'Im gooda t scrabble',
			'until i lose then you cheated',
			2,
			'public',
			24,
			'e',
		],
		[
			'edgs-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/99/200/200',
			'e7955b19-4aa7-52rzc-a0dc-',
			'Test Data ',
			'its a test',
			2,
			'public',
			24,
			'f',
		],
		[
			'33337955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/122/200/200',
			'-4aa7-52rzc-a0dc-afbe55a2893a',
			'Giant Robots ',
			'run away!',
			3,
			'public',
			24,
			'g',
		],
		[
			'1241e7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/211/200/200',
			'e7955b19--52rzc-a0dc-afbe55a2893a',
			'I want to play a game ',
			'instead of writing test data',
			3,
			'public',
			24,
			'h',
		],
		[
			'654654e7955b19-4aa7-52rzc-a0dc-afbe55a2893a',
			'https://picsum.photos/id/19/200/200',
			'-4aa7-52rzc-a0dc-afbe55a2893a',
			'Hey! ',
			'nice to meet u :)',
			3,
			'public',
			24,
			'f',
		],
		[
			'43636-a0dc-afbe55a2893a',
			'https://picsum.photos/id/25/200/200',
			'f',
			'last one ',
			'my guy is aweosme',
			3,
			'public',
			24,
			'f',
		],
		[
			'fsakglasjg',
			'https://picsum.photos/id/111/200/200',
			'e7955b19-4aa7-46dc-a0dc-afbe55a2893a',
			'second one',
			'wwowowowoow tell me more about your adventures',
			3,
			'public',
			412421,
			'e7955b19-4aa7-46dc-a0dc-afbe55a2893a',
		],
	]
	const mapIds: unknown[] = []
	for (const [
		sha,
		thumbnail,
		url,
		name,
		description,
		typeIndex,
		status,
		plays,
		owner_auth,
	] of maps) {
		mapIds.push(
			(
				await db.insert('maps', {
					sha,
					thumbnail,
					url,
					name,
					description,
					map_type_id: mapTypeIds[typeIndex - 1],
					status,
					plays,
					owner_auth,
				})
			).id
		)
	}

	const infoMorphs: [number, number][] = [
		[1, 1],
		[2, 1],
		[2, 2],
	]
	for (const [infoIndex, mapIndex] of infoMorphs) {
		await db.insert('info_morph_map', {
			info_id: infoIds[infoIndex - 1],
			entity_id: mapIds[mapIndex - 1],
			entity_type: 'maps',
		})
	}

	const conversations: [string, string][] = [
		['b', '2023-11-19 09:05:47.583993'],
		['c', '2023-11-15 09:05:47.583993'],
		['a', '2023-11-05 09:05:47.583993'],
	]
	for (const [other, created_at] of conversations) {
		const thread: [string, string, string][] = [
			[user, other, 'hello message one'],
			[user, other, 'Lorem Ipsum is simply dummy text of the printing and typesettin'],
			[other, user, 'The standard chunk of Lorem Ipsum used since the 1500s is repro'],
			[other, user, 'Lorem ipsum dolor sit amet.'],
			[
				other,
				user,
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque consequat feugiat elementum. Pellentesque varius vitae est nec porta. Nunc viverra ac nisi in molestie. Curabitur eget neque nunc. Donec in nibh ipsum. Aenean ut nisi vitae tellus tempor imperdiet ac vel odio. In eu augue at lectus iaculis semper. In mattis ante vitae aliquam porta. Curabitur laoreet vel erat nec faucibus. Quisque iaculis lorem vitae lectus interdum sagittis. Aliquam erat volutpat. Quisque et turpis vel eros tristique bibendum sit amet at ipsum. Integer at quam metus. Suspendisse iaculis mattis nulla.',
			],
			[user, other, 'Fusce nibh justo, tincidunt vitae velit non, rhoncus pulvinar'],
		]
		for (const [source, target, message] of thread) {
			await db.insert('messages', { source, target, message, created_at })
		}
	}
}
