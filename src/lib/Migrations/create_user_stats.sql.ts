export const CreateUserStats = `
create table if not exists user_stats (
    id serial primary key,
    user_auth text references profiles(auth) unique,
    elo int,
    games_played int default 0,
    games_won int default 0,
    games_lost int default 0
);
`
