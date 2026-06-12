export const CreateInfoMorphMap = `
create table if not exists info_morph_map (
    id serial primary key,
    info_id int references info(id),
    entity_id int,
    entity_type text
);
`
