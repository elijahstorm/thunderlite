/**
 * `profiles` — ThunderLite's per-account profile data. The DontCode platform
 * owns the `users` table (auth service), so the old app `users` table lives
 * here instead; `auth` stores the DontCode user id.
 *
 * `email` is a denormalized copy of the account email, recorded when a profile
 * is created/updated by an authenticated request. The auth service owns the
 * real address, but notifications need to reach a *target* user (a friend
 * request recipient, a match opponent) whose access token we do not hold, so
 * we cache it here. Profiles created before this column exists have no email
 * on file and are simply skipped by the notifier.
 */
export const CreateProfiles = `
create table if not exists profiles (
    id serial primary key,
    auth text unique not null,
    email text,
    profile_image_url text,
    username varchar(20) unique,
    display_name varchar(30) unique,
    bio varchar(1000),
    private boolean default false,
    created_at timestamp default current_timestamp
);

alter table profiles add column if not exists email text;
`
