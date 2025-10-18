import { URLSearchParams } from 'node:url';
import { getEnvironment } from '../config/env';
import type {
  ClockifyProject,
  ClockifyTimeEntry,
  ClockifyUser,
  ClockifyWorkspace,
  CreateTimeEntryRequest,
} from '../types/clockify';
import { sleep } from '../utils/common';

interface ClockifyState {
  apiToken: string;
  env: ReturnType<typeof getEnvironment>;
  workspaceId: string | null;
  userId: string | null;
  leagueProjectId: string | null;
}

export function createClockifyService(apiToken: string) {
  const state: ClockifyState = {
    apiToken,
    env: getEnvironment(),
    workspaceId: null,
    userId: null,
    leagueProjectId: null,
  };

  const getHeaders = () => ({
    'X-Api-Key': state.apiToken,
    'Content-Type': 'application/json',
  });

  const initialize = async (): Promise<void> => {
    // Get user info
    const userResponse = await fetch(`${state.env.CLOCKIFY_API_BASE}/v1/user`, {
      headers: getHeaders(),
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to get Clockify user info: ${userResponse.statusText}`);
    }

    const user = (await userResponse.json()) as ClockifyUser;
    state.userId = user.id;
    console.log(`📋 Clockify User: ${user.name} (${user.email})`);

    await sleep(state.env.CLOCKIFY_API_DELAY);

    // Get workspaces
    const workspacesResponse = await fetch(`${state.env.CLOCKIFY_API_BASE}/v1/workspaces`, {
      headers: getHeaders(),
    });

    if (!workspacesResponse.ok) {
      throw new Error(`Failed to get Clockify workspaces: ${workspacesResponse.statusText}`);
    }

    const workspaces = (await workspacesResponse.json()) as ClockifyWorkspace[];
    if (workspaces.length === 0) {
      throw new Error('No Clockify workspaces found');
    }

    state.workspaceId = workspaces[0].id;
    console.log(`📁 Using Clockify Workspace: ${workspaces[0].name}`);

    await sleep(state.env.CLOCKIFY_API_DELAY);
    await getOrCreateLeagueProject();
  };

  const getOrCreateLeagueProject = async (): Promise<void> => {
    if (!state.workspaceId) {
      throw new Error('Workspace ID not set');
    }

    const projectsResponse = await fetch(
      `${state.env.CLOCKIFY_API_BASE}/v1/workspaces/${state.workspaceId}/projects?archived=false`,
      { headers: getHeaders() }
    );

    if (!projectsResponse.ok) {
      throw new Error(`Failed to get projects: ${projectsResponse.statusText}`);
    }

    const projects = (await projectsResponse.json()) as ClockifyProject[];
    const leagueProject = projects.find(
      (p) => p.name.toLowerCase() === state.env.LEAGUE_PROJECT_NAME.toLowerCase()
    );

    if (leagueProject) {
      state.leagueProjectId = leagueProject.id;
      console.log(`📂 Using existing project: ${leagueProject.name}\n`);
    } else {
      await sleep(state.env.CLOCKIFY_API_DELAY);

      const createProjectResponse = await fetch(
        `${state.env.CLOCKIFY_API_BASE}/v1/workspaces/${state.workspaceId}/projects`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name: state.env.LEAGUE_PROJECT_NAME,
            color: '#0AC8B9',
            note: 'League of Legends match history',
            billable: false,
            public: false,
          }),
        }
      );

      if (!createProjectResponse.ok) {
        const errorText = await createProjectResponse.text();
        throw new Error(
          `Failed to create project: ${createProjectResponse.statusText} - ${errorText}`
        );
      }

      const newProject = (await createProjectResponse.json()) as ClockifyProject;
      state.leagueProjectId = newProject.id;
      console.log(`📂 Created new project: ${newProject.name}\n`);
    }
  };

  const getTimeEntriesForDateRange = async (
    startDate: string,
    endDate: string
  ): Promise<ClockifyTimeEntry[]> => {
    if (!state.workspaceId || !state.userId) {
      throw new Error('Clockify client not initialized');
    }

    const allEntries: ClockifyTimeEntry[] = [];
    let page = 1;
    const pageSize = 1000;

    while (true) {
      const params = new URLSearchParams({
        start: `${startDate}T00:00:00Z`,
        end: `${endDate}T23:59:59Z`,
        'page-size': pageSize.toString(),
        page: page.toString(),
      });

      const response = await fetch(
        `${state.env.CLOCKIFY_API_BASE}/v1/workspaces/${state.workspaceId}/user/${state.userId}/time-entries?${params}`,
        { headers: getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get time entries: ${response.statusText}`);
      }

      const entries = (await response.json()) as ClockifyTimeEntry[];
      allEntries.push(...entries);

      if (entries.length < pageSize) {
        break;
      }

      page++;
      await sleep(20);
    }

    return allEntries;
  };

  const createTimeEntry = async (entry: CreateTimeEntryRequest): Promise<ClockifyTimeEntry> => {
    if (!state.workspaceId) {
      throw new Error('Clockify client not initialized');
    }

    if (state.leagueProjectId) {
      entry.projectId = state.leagueProjectId;
    }

    const response = await fetch(
      `${state.env.CLOCKIFY_API_BASE}/v1/workspaces/${state.workspaceId}/time-entries`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(entry),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create time entry: ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<ClockifyTimeEntry>;
  };

  const isMatchSynced = async (
    matchId: string,
    existingEntries: ClockifyTimeEntry[]
  ): Promise<boolean> => {
    return existingEntries.some((entry) => entry.description.includes(`[Match:${matchId}]`));
  };

  return {
    initialize,
    getTimeEntriesForDateRange,
    createTimeEntry,
    isMatchSynced,
  };
}
