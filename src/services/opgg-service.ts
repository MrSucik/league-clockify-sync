import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MatchData, Participant } from '../types/riot';

interface OpggMatch {
  id: string;
  created_at: string;
  game_map: string;
  game_type: string;
  game_length_second: number;
  average_tier_info: {
    tier: string;
    division: number;
  };
  participants: OpggParticipant[];
  teams: OpggTeam[];
}

interface OpggParticipant {
  summoner: {
    puuid: string;
    game_name: string;
    tagline: string;
  };
  champion_id: number;
  team_key: 'BLUE' | 'RED';
  position: string | null;
  items: number[];
  stats: {
    champion_level: number;
    kill: number;
    death: number;
    assist: number;
    minion_kill: number;
    gold_earned: number;
    result: 'WIN' | 'LOSE';
  };
}

interface OpggTeam {
  key: 'BLUE' | 'RED';
  game_stat: {
    is_win: boolean;
  };
}

interface OpggResponse {
  column_descriptions: Record<string, string>;
  data: {
    game_history: OpggMatch[];
  };
  metadata_maps: {
    champion_ids: Record<string, string>;
    item_ids: Record<string, string>;
  };
}

interface OpggServiceConfig {
  gameName: string;
  tagLine: string;
  region: string;
}

const GAME_TYPE_TO_QUEUE_ID: Record<string, number> = {
  SOLORANKED: 420,
  FLEXRANKED: 440,
  NORMAL: 400,
  ARAM: 450,
  URF: 900,
  CLASH: 700,
  BOT: 830,
  CUSTOM: 0,
};

export function createOpggService(config: OpggServiceConfig) {
  let client: Client | null = null;
  let championMap: Record<string, string> = {};

  const connect = async (): Promise<void> => {
    if (client) return;

    console.log('🔌 Connecting to OP.GG MCP Server...');
    const transport = new StreamableHTTPClientTransport(
      new URL('https://mcp-api.op.gg/mcp')
    );

    client = new Client(
      { name: 'league-clockify-sync', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    console.log('✅ Connected to OP.GG MCP Server\n');
  };

  const disconnect = async (): Promise<void> => {
    if (client) {
      await client.close();
      client = null;
    }
  };

  const fetchMatchHistory = async (): Promise<MatchData[]> => {
    if (!client) {
      await connect();
    }

    console.log(`📥 Fetching match history for ${config.gameName}#${config.tagLine} on ${config.region.toUpperCase()}...`);

    const result = await client!.callTool({
      name: 'lol_list_summoner_matches',
      arguments: {
        game_name: config.gameName,
        tag_line: config.tagLine,
        region: config.region,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    if (!content || content.length === 0 || content[0].type !== 'text') {
      throw new Error('Invalid response from OP.GG MCP');
    }

    const response: OpggResponse = JSON.parse(content[0].text);
    championMap = response.metadata_maps.champion_ids;

    const matches = response.data.game_history;
    console.log(`✅ Found ${matches.length} matches from OP.GG\n`);

    return matches.map((match) => convertToMatchData(match));
  };

  const convertToMatchData = (match: OpggMatch): MatchData => {
    const gameEndTimestamp = new Date(match.created_at).getTime();
    const queueId = GAME_TYPE_TO_QUEUE_ID[match.game_type] || 0;

    const participants: Participant[] = match.participants.map((p) => ({
      puuid: p.summoner.puuid,
      summonerName: `${p.summoner.game_name}#${p.summoner.tagline}`,
      championName: championMap[p.champion_id.toString()] || `Champion ${p.champion_id}`,
      teamId: p.team_key === 'BLUE' ? 100 : 200,
      win: p.stats.result === 'WIN',
      kills: p.stats.kill,
      deaths: p.stats.death,
      assists: p.stats.assist,
      totalMinionsKilled: p.stats.minion_kill,
      goldEarned: p.stats.gold_earned,
    }));

    return {
      metadata: {
        matchId: match.id,
        participants: match.participants.map((p) => p.summoner.puuid),
      },
      info: {
        gameDuration: match.game_length_second,
        gameEndTimestamp,
        gameMode: match.game_type,
        gameType: match.game_type,
        queueId,
        participants,
      },
    };
  };

  const getMatchesInDateRange = async (
    startDate: Date,
    endDate: Date
  ): Promise<MatchData[]> => {
    const allMatches = await fetchMatchHistory();
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    const filteredMatches = allMatches.filter((match) => {
      const matchTimestamp = match.info.gameEndTimestamp;
      return matchTimestamp >= startTimestamp && matchTimestamp <= endTimestamp;
    });

    console.log(`📅 Filtered to ${filteredMatches.length} matches within date range`);
    console.log(`   (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})\n`);

    return filteredMatches;
  };

  const getPlayerPuuid = (): string => {
    // Return a consistent identifier for the player
    return `${config.gameName}#${config.tagLine}`.toLowerCase();
  };

  return {
    connect,
    disconnect,
    fetchMatchHistory,
    getMatchesInDateRange,
    getPlayerPuuid,
  };
}
