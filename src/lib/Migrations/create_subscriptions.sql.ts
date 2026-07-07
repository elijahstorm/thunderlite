/**
 * `subscriptions` — ThunderLite Pro billing state, one row per account.
 *
 * The DontCode platform does not (yet) expose a payment/billing service, so
 * this table IS the billing ledger: a subscription is "test mode" — no real
 * money moves and Pro currently gates nothing — but the full lifecycle
 * (activate → renew window → cancel-at-period-end → lapsed) is recorded here so
 * the checkout and management flow can be exercised end to end.
 *
 * `provider` marks where the charge came from ('test' for the simulated
 * checkout) so real payments can slot in later without a schema change.
 */
export const CreateSubscriptions = `
create table if not exists subscriptions (
    id serial primary key,
    user_auth text references profiles(auth) unique not null,
    plan varchar(30) not null,
    status varchar(20) not null default 'active',
    provider varchar(30) not null default 'test',
    price_cents int not null default 0,
    interval varchar(10) not null default 'month',
    started_at timestamp default current_timestamp,
    current_period_end timestamp,
    cancel_at_period_end boolean default false,
    canceled_at timestamp,
    updated_at timestamp default current_timestamp
);
`
