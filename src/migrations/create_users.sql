create table users (
    id serial primary key,
    auth text unique
    username text,
    display_name text unique,
    profile_image_url text,
    bio text,
    email text unique,
    created_at TIMESTAMP,
)
