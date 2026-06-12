export const CreateLogs = `
create table if not exists logs (
    id serial primary key,
    type text,
    message text,
    time timestamp default current_timestamp
);
`
