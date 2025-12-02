import * as cliProgress from 'cli-progress';
import { validateEnvironment } from '../config/env';
import { createClockifyService } from '../services/clockify-service';
import { createOpggService } from '../services/opgg-service';
import { QUEUE_TYPES } from '../types/riot';
import { formatDuration, formatKDA, getErrorMessage, isApiError, sleep } from '../utils/common';

const env = validateEnvironment();

async function syncLeagueToClockify(
  opggService: ReturnType<typeof createOpggService>,
  clockifyService: ReturnType<typeof createClockifyService>
): Promise<void> {
  try {
    console.log('🎮 Starting League of Legends to Clockify sync...\n');

    await clockifyService.initialize();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - env.SYNC_DAYS);

    console.log(
      `📅 Fetching matches from last ${env.SYNC_DAYS} days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})...\n`
    );

    const matches = await opggService.getMatchesInDateRange(startDate, endDate);

    console.log(`✅ Found ${matches.length} matches in date range\n`);

    if (matches.length === 0) {
      console.log('No matches found. Exiting...');
      return;
    }

    // Show queue type breakdown
    const queueBreakdown: Record<number, { count: number; name: string }> = {};
    for (const match of matches) {
      const queueId = match.info.queueId;
      const queueInfo = QUEUE_TYPES[queueId];
      const queueName = queueInfo ? queueInfo.description : `Unknown Queue ${queueId}`;

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

    // Get existing Clockify entries
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

    progressBar.start(matches.length, 0);

    const playerIdentifier = opggService.getPlayerPuuid();

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];

      progressBar.update(i + 1);

      // Check if already synced
      if (await clockifyService.isMatchSynced(match.metadata.matchId, existingEntries)) {
        skippedCount++;
        continue;
      }

      // Find player's data
      const playerData = match.info.participants.find(
        (p) => p.summonerName.toLowerCase() === playerIdentifier
      );

      if (!playerData) {
        failedCount++;
        continue;
      }

      // Get queue type information
      const queueInfo = QUEUE_TYPES[match.info.queueId];
      const queueName = queueInfo ? queueInfo.description : `Queue ${match.info.queueId}`;

      // Format match data
      const result = playerData.win ? 'Win' : 'Loss';
      const resultEmoji = playerData.win ? '✅' : '❌';
      const kda = formatKDA(playerData.kills, playerData.deaths, playerData.assists);

      // Calculate game times
      const gameEndTime = new Date(match.info.gameEndTimestamp);
      const gameStartTime = new Date(gameEndTime.getTime() - match.info.gameDuration * 1000);

      const duration = formatDuration(match.info.gameDuration);

      const description = `${resultEmoji} ${playerData.championName} - ${result} (${kda}) | ${queueName} | ${duration.hours}h ${duration.minutes}m [Match:${match.metadata.matchId}]`;

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
    console.log(`   - League matches found: ${matches.length}`);
    console.log(`   - Newly synced: ${syncedCount}`);
    console.log(`   - Already existed: ${skippedCount}`);
    console.log(`   - Failed: ${failedCount}`);
    console.log(
      `   - Total in Clockify now: ${existingLeagueEntries.length + syncedCount} match entries`
    );
  } catch (error: unknown) {
    console.error('\n❌ Sync failed:');

    if (isApiError(error)) {
      console.error('Status:', error.status);
      const errorData = error.data as Record<string, unknown>;
      console.error('Error:', errorData?.detail || error.statusText);
    } else {
      console.error('Error:', getErrorMessage(error));
    }
    throw error;
  }
}

async function main() {
  console.log('🎮 League of Legends → Clockify Sync (via OP.GG)\n');
  console.log('This tool syncs your League match history to Clockify as time entries.\n');

  const opggService = createOpggService({
    gameName: env.OPGG_GAME_NAME,
    tagLine: env.OPGG_TAG_LINE,
    region: env.OPGG_REGION,
  });

  const clockifyService = createClockifyService(env.CLOCKIFY_API_TOKEN);

  try {
    await syncLeagueToClockify(opggService, clockifyService);
  } finally {
    await opggService.disconnect();
  }
}

main().catch(console.error);
