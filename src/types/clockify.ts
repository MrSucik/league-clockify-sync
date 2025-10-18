export interface ClockifyUser {
  id: string;
  email: string;
  name: string;
  activeWorkspace: string;
  defaultWorkspace: string;
}

export interface ClockifyWorkspace {
  id: string;
  name: string;
}

export interface ClockifyProject {
  id: string;
  name: string;
  clientId: string;
  workspaceId: string;
  billable: boolean;
  color: string;
  archived: boolean;
}

export interface ClockifyTimeEntry {
  id: string;
  description: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  billable: boolean;
  timeInterval: {
    start: string;
    end: string;
    duration: string;
  };
}

export interface CreateTimeEntryRequest {
  start: string;
  end: string;
  billable: boolean;
  description: string;
  projectId?: string;
}
