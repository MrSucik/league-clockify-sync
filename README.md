# League of Legends to Clockify Sync

Automatically sync your League of Legends game history to Clockify as time entries.

## Features

- Fetches match history from OP.GG (no API key expiration!)
- Syncs game duration to Clockify as time entries
- Prevents duplicate entries
- Tracks wins/losses, champions, and game modes
- Hourly scheduled sync via cron

## Prerequisites

1. **Your Riot ID** (e.g., `PlayerName#TAG`)

2. **Clockify API Token**
   - Get your token from [Clockify Settings](https://app.clockify.me/user/settings)

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy `env.example` to `.env` and fill in your credentials:
```bash
cp env.example .env
```

3. Run the sync:
```bash
pnpm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPGG_GAME_NAME` | Your Riot ID name (before #) | - |
| `OPGG_TAG_LINE` | Your Riot ID tag (after #) | - |
| `OPGG_REGION` | Region: euw, eune, na, kr, etc. | - |
| `SYNC_DAYS` | Number of days to sync | 14 |
| `LEAGUE_PROJECT_NAME` | Clockify project name | League of Legends |
| `CLOCKIFY_API_DELAY` | Delay between API calls (ms) | 50 |

## How It Works

1. Connects to OP.GG MCP Server to fetch match history
2. Filters matches within the configured date range
3. Creates time entries in Clockify with:
   - Game duration as time entry duration
   - Champion name and result (Win/Loss)
   - Game mode (Ranked, ARAM, etc.)
   - Unique match ID to prevent duplicates

## Running as a Service

For scheduled syncing, use the cron script:

```bash
# Run with hourly sync
npx tsx src/cron.ts
```

Or with Docker:

```bash
docker build -t league-clockify-sync .
docker run -d --env-file .env league-clockify-sync
```

## License

ISC
