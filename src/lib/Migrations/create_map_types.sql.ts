export const CreateMapTypes = `
create table if not exists map_types (
    id serial primary key,
    text varchar(50)
);
`
