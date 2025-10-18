# League of Legends to Clockify Sync

Automatically sync your League of Legends game history to Clockify as time entries.

## Features

- Fetches match history from Riot Games API
- Syncs game duration to Clockify as time entries
- Prevents duplicate entries
- Tracks wins/losses, champions, and game modes
- Rate limiting to respect API limits

## Prerequisites

1. **Riot Games API Key**
   - Get your API key from [Riot Developer Portal](https://developer.riotgames.com/)
   - Development keys expire every 24 hours
   - Production keys require verification

2. **Summoner PUUID**
   - Find your PUUID using the Summoner API
   - Or use [this tool](https://developer.riotgames.com/apis#summoner-v4)

3. **Clockify API Token**
   - Get your token from [Clockify Settings](https://app.clockify.me/user/settings)

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp env.example .env
```

3. Run the sync:
```bash
pnpm start
```

## Configuration

- `SYNC_DAYS`: Number of days to sync (default: 7)
- `LEAGUE_PROJECT_NAME`: Clockify project name (default: "League of Legends")
- `CLOCKIFY_API_DELAY`: Delay between API calls in ms (default: 50)

## How It Works

1. Fetches recent matches from Riot Games API
2. Gets detailed match information
3. Creates time entries in Clockify with:
   - Game duration as time entry duration
   - Champion name and result (Win/Loss)
   - Game mode (Ranked, ARAM, etc.)
   - Unique match ID to prevent duplicates

## License

ISC
