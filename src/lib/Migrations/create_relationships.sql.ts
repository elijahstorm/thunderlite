export const CreateRelationships = `
create table if not exists relationships (
    id serial primary key,
    source text references profiles(auth),
    target text references profiles(auth),
    status varchar(20) default 'unknown',
    created_at timestamp default current_timestamp
);
`
