/**
 * `email_log` — audit + dedup ledger for transactional email.
 *
 * The DontCode notifications gateway does the actual sending; this table is the
 * app's record of what it *asked* to send. `dedup_key` (unique) is how a
 * trigger stays idempotent: a given event for a given user records one row, and
 * a repeat attempt hits the unique constraint and is skipped, so a retried
 * request or a double-fired hook never sends the same email twice.
 */
export const CreateEmailLog = `
create table if not exists email_log (
    id serial primary key,
    dedup_key text unique not null,
    recipient text not null,
    category varchar(40) not null,
    subject text not null,
    message_id text,
    success boolean not null default false,
    error text,
    created_at timestamp default current_timestamp
);
`
