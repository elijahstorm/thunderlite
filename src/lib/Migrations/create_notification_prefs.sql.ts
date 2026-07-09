/**
 * `notification_prefs` — per-account email opt-outs, one row per profile.
 *
 * Everything defaults on; a row exists only once a user has changed something
 * (managed from the settings page). The notifier treats a missing row as
 * "all enabled". `email_enabled` is the master switch; the per-category flags
 * (subscription / social / game) are checked on top of it.
 */
export const CreateNotificationPrefs = `
create table if not exists notification_prefs (
    user_auth text references profiles(auth) unique not null,
    email_enabled boolean default true,
    subscription boolean default true,
    social boolean default true,
    game boolean default true,
    updated_at timestamp default current_timestamp
);
`
