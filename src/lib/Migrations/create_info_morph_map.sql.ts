import type postgres from 'postgres'

export const CreateInfoMorphMap = (sql: postgres.Sql) =>
	sql`
        create table info_morph_map (
            id serial primary key,
            info_id int references info(id),
            entity_id int,
            entity_type text
        )
        `
