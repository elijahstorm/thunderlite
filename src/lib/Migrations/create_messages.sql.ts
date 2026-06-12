export const CreateMessages = `
create table if not exists messages (
    id serial primary key,
    source text references profiles(auth),
    target text references profiles(auth),
    message text not null,
    read_at timestamp default null,
    created_at timestamp default current_timestamp
);
`
