/**
 * `profiles` — ThunderLite's per-account profile data. The DontCode platform
 * owns the `users` table (auth service), so the old app `users` table lives
 * here instead; `auth` stores the DontCode user id.
 */
export const CreateProfiles = `
create table if not exists profiles (
    id serial primary key,
    auth text unique not null,
    profile_image_url text,
    username varchar(20) unique,
    display_name varchar(30) unique,
    bio varchar(1000),
    private boolean default false,
    created_at timestamp default current_timestamp
);
`
