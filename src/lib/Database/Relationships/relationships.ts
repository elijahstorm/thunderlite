import type postgres from 'postgres'

export const setRelationship: (
	params: {
		source?: string
		target: string
		status: RelationshipStatus
	},
	sql: postgres.Sql,
	resolve: (response: { status: string }) => void
) => void = async (params, sql, resolve) => {
	const { source, target, status } = params

	if (!source) return resolve({ status: 'not logged in' })
	if (source === target) return resolve({ status: 'same' })

	const relationship = (
		await sql`
        select
            (
                select status from relationships
                where source = ${source} and target = ${target}
            ) as mine,
            (
                select status from relationships
                where source = ${target} and target = ${source}
            ) as theirs`
	)[0] as { mine?: RelationshipStatus; theirs?: RelationshipStatus }

	if (!relationship) {
		await sql`insert into relationships ${sql(
			{ source, target, status },
			'source',
			'target',
			'status'
		)}`
	} else if (relationship.mine !== status) {
		if (status === 'friend-request' && relationship.mine === 'friends') {
			return resolve({ status: 'friends' })
		}
		if (status === 'friend-request' && relationship.theirs === 'friend-request') {
			await sql`
				update relationships set 'friends'
				where source = ${source} and target = ${target}`
			await sql`
				update relationships set 'friends'
				where source = ${target} and target = ${source}`
			return resolve({ status: 'friends' })
		}
		if (status === 'blocked') {
			await sql`
				update relationships set 'unknown'
				where source = ${target} and target = ${source}`
		}
		await sql`
			update relationships set ${sql({ status }, 'status')}
			where source = ${source} and target = ${target}`
	}

	resolve({ status: 'ok' })
}
