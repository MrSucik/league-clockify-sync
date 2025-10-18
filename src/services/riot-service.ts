import { getEnvironment } from '../config/env';
import type { MatchData, MatchId } from '../types/riot';
import { sleep } from '../utils/common';

interface RiotState {
  apiKey: string;
  env: ReturnType<typeof getEnvironment>;
}

export function createRiotService(apiKey: string) {
  const state: RiotState = {
    apiKey,
    env: getEnvironment(),
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

    // Add rate limiting delay
    await sleep(1000);

    // Fetch match details
    const matches: MatchData[] = [];

    for (let i = 0; i < matchIds.length; i++) {
      const matchId = matchIds[i];

      try {
        const matchData = await getMatchData(matchId);
        matches.push(matchData);

        // Rate limiting - Riot API allows 20 requests per second for development keys
        // Using 1 second delay to be safe with rate limits
        await sleep(1000);
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
    let start = 0;
    const count = 100; // Fetch in batches of 100

    while (true) {
      const matchIds = await getMatchIds(puuid, start, count);

      if (matchIds.length === 0) {
        break;
      }

      // Fetch match details
      for (const matchId of matchIds) {
        try {
          const matchData = await getMatchData(matchId);

          // Check if match is within date range
          if (
            matchData.info.gameEndTimestamp >= startTimestamp &&
            matchData.info.gameEndTimestamp <= endTimestamp
          ) {
            allMatches.push(matchData);
          } else if (matchData.info.gameEndTimestamp < startTimestamp) {
            // We've gone past the date range, stop fetching
            return allMatches;
          }

          await sleep(1000);
        } catch (error) {
          console.error(`Failed to fetch match ${matchId}:`, error);
        }
      }

      // If we got fewer matches than requested, we've reached the end
      if (matchIds.length < count) {
        break;
      }

      start += count;
      await sleep(1000);
    }

    return allMatches;
  };

  return {
    getMatchIds,
    getMatchData,
    getRecentMatches,
    getMatchesInDateRange,
  };
}
