import type { MigratorTypes } from './list'

export const CreateUserTable = async (types: MigratorTypes) =>
	await (types.local
		? types.local`
        create table users (
            id serial primary key,
            auth text unique not null,
            username text,
            display_name text unique,
            profile_image_url text,
            bio text,
            created_at TIMESTAMP
        )
        `
		: types.prod
		? types.prod.query(`
        create table users (
            id serial primary key,
            auth text unique not null,
            username text,
            display_name text unique,
            profile_image_url text,
            bio text,
            created_at TIMESTAMP
        )
    `)
		: null)
