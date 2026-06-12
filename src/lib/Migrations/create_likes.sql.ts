export const CreateLikes = `
create table if not exists likes (
    id serial primary key,
    user_auth text references profiles(auth),
    map_id int references maps(id),
    created_at timestamp default current_timestamp
);
`
