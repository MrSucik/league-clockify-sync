export interface MatchId {
  matchId: string;
}

export interface MatchData {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameDuration: number;
    gameEndTimestamp: number;
    gameMode: string;
    gameType: string;
    queueId: number;
    participants: Participant[];
  };
}

export interface Participant {
  puuid: string;
  summonerName: string;
  championName: string;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  goldEarned: number;
}

export interface QueueInfo {
  queueId: number;
  map: string;
  description: string;
}

export const QUEUE_TYPES: Record<number, QueueInfo> = {
  400: { queueId: 400, map: "Summoner's Rift", description: 'Normal Draft Pick' },
  420: { queueId: 420, map: "Summoner's Rift", description: 'Ranked Solo/Duo' },
  430: { queueId: 430, map: "Summoner's Rift", description: 'Normal Blind Pick' },
  440: { queueId: 440, map: "Summoner's Rift", description: 'Ranked Flex' },
  450: { queueId: 450, map: "Howling Abyss", description: 'ARAM' },
  700: { queueId: 700, map: "Summoner\'s Rift", description: 'Clash' },
  830: { queueId: 830, map: "Summoner's Rift", description: 'Co-op vs. AI Intro' },
  840: { queueId: 840, map: "Summoner's Rift", description: 'Co-op vs. AI Beginner' },
  850: { queueId: 850, map: "Summoner's Rift", description: 'Co-op vs. AI Intermediate' },
  900: { queueId: 900, map: "Summoner's Rift", description: 'URF' },
  1020: { queueId: 1020, map: "Summoner's Rift", description: 'One for All' },
  1300: { queueId: 1300, map: 'Nexus Blitz', description: 'Nexus Blitz' },
  1400: { queueId: 1400, map: "Summoner's Rift", description: 'Ultimate Spellbook' },
};
