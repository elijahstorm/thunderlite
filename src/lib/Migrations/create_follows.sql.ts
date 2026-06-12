export const CreateFollows = `
create table if not exists follows (
    id serial primary key,
    source text references profiles(auth),
    target text references profiles(auth),
    created_at timestamp default current_timestamp
);
`
