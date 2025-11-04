import { getEnvironment } from '../config/env';
import type { MatchData, MatchId } from '../types/riot';
import { sleep } from '../utils/common';
import { createRateLimiter } from '../utils/rate-limiter';

interface RiotState {
  apiKey: string;
  env: ReturnType<typeof getEnvironment>;
  rateLimiter: ReturnType<typeof createRateLimiter>;
}

export function createRiotService(apiKey: string) {
  const state: RiotState = {
    apiKey,
    env: getEnvironment(),
    rateLimiter: createRateLimiter(),
  };

  const getHeaders = () => ({
    'X-Riot-Token': state.apiKey,
    'Content-Type': 'application/json',
  });

  /**
   * Get match IDs for a summoner
   */
  const getMatchIds = async (
    puuid: string,
    start: number = 0,
    count: number = 20
  ): Promise<string[]> => {
    await state.rateLimiter.waitForSlot();

    const params = new URLSearchParams({
      start: start.toString(),
      count: count.toString(),
    });

    const response = await fetch(
      `${state.env.RIOT_API_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
      };
    }

    return response.json() as Promise<string[]>;
  };

  /**
   * Get match details by match ID with retry logic
   */
  const getMatchData = async (matchId: string, retries: number = 3): Promise<MatchData> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await state.rateLimiter.waitForSlot();

        const response = await fetch(
          `${state.env.RIOT_API_BASE}/lol/match/v5/matches/${matchId}`,
          { headers: getHeaders() }
        );

        if (response.status === 429) {
          // Rate limited - wait longer before retrying
          const waitTime = Math.pow(2, attempt) * 2000; // Exponential backoff: 2s, 4s, 8s
          console.log(`⏳ Rate limited, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
          await sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw {
            status: response.status,
            statusText: response.statusText,
            data: errorData,
          };
        }

        return response.json() as Promise<MatchData>;
      } catch (error: any) {
        if (error.status === 429 && attempt < retries - 1) {
          const waitTime = Math.pow(2, attempt) * 2000;
          console.log(`⏳ Rate limited, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
          await sleep(waitTime);
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Failed to fetch match ${matchId} after ${retries} attempts`);
  };

  /**
   * Get recent matches for a summoner
   */
  const getRecentMatches = async (puuid: string, count: number = 20): Promise<MatchData[]> => {
    console.log(`📥 Fetching ${count} recent match IDs...`);

    // Get match IDs
    const matchIds = await getMatchIds(puuid, 0, count);
    console.log(`✅ Found ${matchIds.length} matches`);

    // Fetch match details
    const matches: MatchData[] = [];

    for (let i = 0; i < matchIds.length; i++) {
      const matchId = matchIds[i];

      try {
        const matchData = await getMatchData(matchId);
        matches.push(matchData);
      } catch (error) {
        console.error(`Failed to fetch match ${matchId}:`, error);
      }
    }

    return matches;
  };

  /**
   * Get matches within a date range
   */
  const getMatchesInDateRange = async (
    puuid: string,
    startDate: Date,
    endDate: Date
  ): Promise<MatchData[]> => {
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    console.log(
      `📅 Fetching matches from ${startDate.toISOString()} to ${endDate.toISOString()}...`
    );

    const allMatches: MatchData[] = [];
    const queueIdCounts: Record<number, number> = {};
    let filteredOldCount = 0;
    let filteredNewCount = 0;
    let start = 0;
    const count = 100; // Fetch in batches of 100

    while (true) {
      const matchIds = await getMatchIds(puuid, start, count);

      if (matchIds.length === 0) {
        break;
      }

      console.log(`📦 Fetched batch of ${matchIds.length} match IDs (offset: ${start})...`);

      // Fetch match details
      let shouldStop = false;
      for (const matchId of matchIds) {
        try {
          const matchData = await getMatchData(matchId);
          const matchDate = new Date(matchData.info.gameEndTimestamp);

          // Track queue types
          queueIdCounts[matchData.info.queueId] = (queueIdCounts[matchData.info.queueId] || 0) + 1;

          // Check if match is within date range
          if (
            matchData.info.gameEndTimestamp >= startTimestamp &&
            matchData.info.gameEndTimestamp <= endTimestamp
          ) {
            allMatches.push(matchData);
            console.log(`   ✓ Match ${matchId} - Queue ${matchData.info.queueId} - ${matchDate.toISOString()}`);
          } else if (matchData.info.gameEndTimestamp < startTimestamp) {
            // Match is older than our date range
            filteredOldCount++;
            console.log(`   ⏭ Skipping old match ${matchId} - ${matchDate.toISOString()} (before ${startDate.toISOString()})`);
            shouldStop = true;
          } else {
            // Match is newer than our date range
            filteredNewCount++;
            console.log(`   ⏭ Skipping new match ${matchId} - ${matchDate.toISOString()} (after ${endDate.toISOString()})`);
          }

        } catch (error) {
          console.error(`Failed to fetch match ${matchId}:`, error);
        }
      }

      // If we found matches older than our range, stop pagination
      if (shouldStop) {
        console.log(`🛑 Reached matches older than date range, stopping pagination...`);
        break;
      }

      // If we got fewer matches than requested, we've reached the end
      if (matchIds.length < count) {
        break;
      }

      start += count;
    }

    console.log(`\n📊 Match fetching summary:`);
    console.log(`   - Matches in date range: ${allMatches.length}`);
    console.log(`   - Filtered (too old): ${filteredOldCount}`);
    console.log(`   - Filtered (too new): ${filteredNewCount}`);
    console.log(`   - Queue types found:`);
    for (const [queueId, count] of Object.entries(queueIdCounts)) {
      console.log(`     • Queue ${queueId}: ${count} matches`);
    }
    console.log('');

    return allMatches;
  };

  return {
    getMatchIds,
    getMatchData,
    getRecentMatches,
    getMatchesInDateRange,
  };
}
