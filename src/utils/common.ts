/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format duration in seconds to hours and minutes
 */
export function formatDuration(seconds: number): { hours: number; minutes: number } {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { hours, minutes };
}

/**
 * Get error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if error is an API error with status
 */
export function isApiError(
  error: unknown
): error is { status: number; statusText: string; data: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'statusText' in error &&
    'data' in error
  );
}

/**
 * Create a unique match ID for deduplication
 */
export function createMatchId(matchId: string): string {
  return matchId;
}

/**
 * Format KDA (Kills/Deaths/Assists)
 */
export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`;
}
