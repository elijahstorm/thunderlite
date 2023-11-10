import type postgres from 'postgres'

export const CreateShareMorphMap = (sql: postgres.Sql) =>
	sql`
        create table share_morph_map (
            id serial primary key,
            map_id int references maps(id),
            entity_id int,
            entity_type text,
            type text
        )
        `
