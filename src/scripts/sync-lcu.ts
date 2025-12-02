import * as cliProgress from 'cli-progress';
import * as fs from 'node:fs';
import * as https from 'node:https';
import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';
import { QUEUE_TYPES } from '../types/riot';
import { formatDuration, formatKDA, getErrorMessage, sleep } from '../utils/common';

const env = validateEnvironment();

const CHAMPION_MAP: Record<number, string> = {
  1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'Twisted Fate', 5: 'Xin Zhao',
  6: 'Urgot', 7: 'LeBlanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle',
  11: 'Master Yi', 12: 'Alistar', 13: 'Ryze', 14: 'Sion', 15: 'Sivir',
  16: 'Soraka', 17: 'Teemo', 18: 'Tristana', 19: 'Warwick', 20: 'Nunu & Willump',
  21: 'Miss Fortune', 22: 'Ashe', 23: 'Tryndamere', 24: 'Jax', 25: 'Morgana',
  26: 'Zilean', 27: 'Singed', 28: 'Evelynn', 29: 'Twitch', 30: 'Karthus',
  31: "Cho'Gath", 32: 'Amumu', 33: 'Rammus', 34: 'Anivia', 35: 'Shaco',
  36: 'Dr. Mundo', 37: 'Sona', 38: 'Kassadin', 39: 'Irelia', 40: 'Janna',
  41: 'Gangplank', 42: 'Corki', 43: 'Karma', 44: 'Taric', 45: 'Veigar',
  48: 'Trundle', 50: 'Swain', 51: 'Caitlyn', 53: 'Blitzcrank', 54: 'Malphite',
  55: 'Katarina', 56: 'Nocturne', 57: 'Maokai', 58: 'Renekton', 59: 'Jarvan IV',
  60: 'Elise', 61: 'Orianna', 62: 'Wukong', 63: 'Brand', 64: 'Lee Sin',
  67: 'Vayne', 68: 'Rumble', 69: 'Cassiopeia', 72: 'Skarner', 74: 'Heimerdinger',
  75: 'Nasus', 76: 'Nidalee', 77: 'Udyr', 78: 'Poppy', 79: 'Gragas',
  80: 'Pantheon', 81: 'Ezreal', 82: 'Mordekaiser', 83: 'Yorick', 84: 'Akali',
  85: 'Kennen', 86: 'Garen', 89: 'Leona', 90: 'Malzahar', 91: 'Talon',
  92: 'Riven', 96: "Kog'Maw", 98: 'Shen', 99: 'Lux', 101: 'Xerath',
  102: 'Shyvana', 103: 'Ahri', 104: 'Graves', 105: 'Fizz', 106: 'Volibear',
  107: 'Rengar', 110: 'Varus', 111: 'Nautilus', 112: 'Viktor', 113: 'Sejuani',
  114: 'Fiora', 115: 'Ziggs', 117: 'Lulu', 119: 'Draven', 120: 'Hecarim',
  121: "Kha'Zix", 122: 'Darius', 126: 'Jayce', 127: 'Lissandra', 131: 'Diana',
  133: 'Quinn', 134: 'Syndra', 136: 'Aurelion Sol', 141: 'Kayn', 142: 'Zoe',
  143: 'Zyra', 145: "Kai'Sa", 147: "Seraphine", 150: 'Gnar', 154: 'Zac',
  157: 'Yasuo', 161: "Vel'Koz", 163: 'Taliyah', 164: 'Camille', 166: "Akshan",
  200: "Bel'Veth", 201: 'Braum', 202: 'Jhin', 203: 'Kindred', 221: 'Zeri',
  222: 'Jinx', 223: 'Tahm Kench', 233: 'Briar', 234: 'Viego', 235: 'Senna',
  236: 'Lucian', 238: 'Zed', 240: 'Kled', 245: 'Ekko', 246: 'Qiyana',
  254: 'Vi', 266: 'Aatrox', 267: 'Nami', 268: 'Azir', 350: 'Yuumi',
  360: 'Samira', 412: 'Thresh', 420: 'Illaoi', 421: "Rek'Sai", 427: 'Ivern',
  429: 'Kalista', 432: 'Bard', 497: 'Rakan', 498: 'Xayah', 516: 'Ornn',
  517: 'Sylas', 518: 'Neeko', 523: 'Aphelios', 526: 'Rell', 555: 'Pyke',
  711: 'Vex', 777: 'Yone', 799: 'Ambessa', 875: "Sett", 876: 'Lillia',
  887: 'Gwen', 888: 'Renata Glasc', 895: 'Nilah', 897: "K'Sante", 901: 'Smolder',
  902: 'Milio', 910: 'Hwei', 950: 'Naafiri', 893: 'Aurora',
};

const EXTRA_QUEUE_TYPES: Record<number, string> = {
  ...Object.fromEntries(Object.entries(QUEUE_TYPES).map(([k, v]) => [k, v.description])),
  2400: 'Arena',
  1700: 'Arena',
  1710: 'Arena',
};

interface LcuCredentials {
  port: number;
  password: string;
}

interface LcuMatch {
  gameId: number;
  gameCreationDate: string;
  gameDuration: number;
  gameMode: string;
  queueId: number;
  participantIdentities: Array<{
    participantId: number;
    player: { gameName: string; tagLine: string };
  }>;
  participants: Array<{
    participantId: number;
    championId: number;
    stats: {
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
    };
  }>;
}

function getLcuCredentials(): LcuCredentials | null {
  const lockfilePath = '/Applications/League of Legends.app/Contents/LoL/lockfile';

  try {
    const content = fs.readFileSync(lockfilePath, 'utf-8');
    const parts = content.split(':');
    return {
      port: parseInt(parts[2], 10),
      password: parts[3],
    };
  } catch {
    return null;
  }
}

async function fetchLcuMatchHistory(creds: LcuCredentials, count = 20): Promise<LcuMatch[]> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${creds.password}`).toString('base64');

    const options = {
      hostname: '127.0.0.1',
      port: creds.port,
      path: `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.games?.games || []);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🎮 League of Legends → Clockify Sync (via LCU)\n');
  console.log('This tool syncs match history directly from your League client.\n');

  const creds = getLcuCredentials();
  if (!creds) {
    console.error('❌ League client is not running or lockfile not found.');
    console.error('   Please start League of Legends and try again.');
    process.exit(1);
  }

  console.log(`✅ Found League client on port ${creds.port}\n`);

  console.log('📥 Fetching match history from League client...');
  const matches = await fetchLcuMatchHistory(creds, 50);
  console.log(`✅ Found ${matches.length} matches\n`);

  if (matches.length === 0) {
    console.log('No matches found. Exiting...');
    return;
  }

  // Filter to last SYNC_DAYS
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - env.SYNC_DAYS);

  const filteredMatches = matches.filter((match) => {
    const matchDate = new Date(match.gameCreationDate);
    return matchDate >= startDate && matchDate <= endDate;
  });

  console.log(`📅 Filtered to ${filteredMatches.length} matches in last ${env.SYNC_DAYS} days\n`);

  // Queue breakdown
  const queueBreakdown: Record<number, { count: number; name: string }> = {};
  for (const match of filteredMatches) {
    const queueId = match.queueId;
    const queueName = EXTRA_QUEUE_TYPES[queueId] || `Unknown (${queueId})`;
    if (!queueBreakdown[queueId]) {
      queueBreakdown[queueId] = { count: 0, name: queueName };
    }
    queueBreakdown[queueId].count++;
  }

  console.log('📊 Queue type breakdown:');
  for (const [, info] of Object.entries(queueBreakdown)) {
    console.log(`   - ${info.name}: ${info.count} matches`);
  }
  console.log('');

  // Initialize Clockify
  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);
  await clockifyService.initialize();

  // Get existing entries
  const existingEntries = await clockifyService.getTimeEntriesForDateRange(
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  );

  const existingLeagueEntries = existingEntries.filter((entry) =>
    entry.description.includes('[Match:')
  );

  console.log(`📊 Found ${existingEntries.length} existing time entries in Clockify`);
  console.log(`   - ${existingLeagueEntries.length} are League entries\n`);

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  console.log('📊 Processing matches...\n');

  const progressBar = new cliProgress.SingleBar({
    format: '⏳ Progress |{bar}| {percentage}% | {value}/{total} Matches',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  progressBar.start(filteredMatches.length, 0);

  for (let i = 0; i < filteredMatches.length; i++) {
    const match = filteredMatches[i];
    progressBar.update(i + 1);

    const matchId = `EUN1_${match.gameId}`;

    // Check if already synced
    if (await clockifyService.isMatchSynced(matchId, existingEntries)) {
      skippedCount++;
      continue;
    }

    // Find player data
    const playerIdentity = match.participantIdentities.find(
      (p) => p.player.gameName === env.OPGG_GAME_NAME && p.player.tagLine === env.OPGG_TAG_LINE
    );

    if (!playerIdentity) {
      failedCount++;
      continue;
    }

    const playerStats = match.participants.find(
      (p) => p.participantId === playerIdentity.participantId
    );

    if (!playerStats) {
      failedCount++;
      continue;
    }

    const championName = CHAMPION_MAP[playerStats.championId] || `Champion ${playerStats.championId}`;
    const queueName = EXTRA_QUEUE_TYPES[match.queueId] || match.gameMode;
    const result = playerStats.stats.win ? 'Win' : 'Loss';
    const resultEmoji = playerStats.stats.win ? '✅' : '❌';
    const kda = formatKDA(playerStats.stats.kills, playerStats.stats.deaths, playerStats.stats.assists);

    const gameEndTime = new Date(new Date(match.gameCreationDate).getTime() + match.gameDuration * 1000);
    const gameStartTime = new Date(match.gameCreationDate);
    const duration = formatDuration(match.gameDuration);

    const description = `${resultEmoji} ${championName} - ${result} (${kda}) | ${queueName} | ${duration.hours}h ${duration.minutes}m [Match:${matchId}]`;

    try {
      await clockifyService.createTimeEntry({
        start: gameStartTime.toISOString(),
        end: gameEndTime.toISOString(),
        billable: false,
        description: description,
      });

      syncedCount++;
      await sleep(env.CLOCKIFY_API_DELAY);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      failedCount++;

      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        await sleep(200);
      }
    }
  }

  progressBar.stop();

  console.log(`\n🎉 Sync complete!`);
  console.log(`   - Matches found: ${filteredMatches.length}`);
  console.log(`   - Newly synced: ${syncedCount}`);
  console.log(`   - Already existed: ${skippedCount}`);
  console.log(`   - Failed: ${failedCount}`);
  console.log(`   - Total in Clockify now: ${existingLeagueEntries.length + syncedCount} match entries`);
}

main().catch(console.error);
