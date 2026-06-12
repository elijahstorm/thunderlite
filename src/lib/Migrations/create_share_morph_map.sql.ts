export const CreateShareMorphMap = `
create table if not exists share_morph_map (
    id serial primary key,
    map_id int references maps(id),
    entity_id int,
    entity_type text,
    type text
);
`
