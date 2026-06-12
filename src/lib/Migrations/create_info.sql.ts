export const CreateInfo = `
create table if not exists info (
    id serial primary key,
    info varchar(30),
    color varchar(30)
);
`
