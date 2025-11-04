/**
 * Rate limiter for Riot API
 * Handles: 20 requests/second and 100 requests/2 minutes
 */

const SHORT_WINDOW = 1000; // 1 second
const LONG_WINDOW = 120000; // 2 minutes
const SHORT_LIMIT = 20;
const LONG_LIMIT = 100;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export const createRateLimiter = () => {
  let requestTimestamps: number[] = [];

  const waitForSlot = async (): Promise<void> => {
    const now = Date.now();

    // Clean old timestamps
    requestTimestamps = requestTimestamps.filter(
      timestamp => now - timestamp < LONG_WINDOW
    );

    // Check short window (1 second)
    const recentRequests = requestTimestamps.filter(
      timestamp => now - timestamp < SHORT_WINDOW
    );

    if (recentRequests.length >= SHORT_LIMIT) {
      // Wait until oldest request in short window expires
      const oldestInShortWindow = Math.min(...recentRequests);
      const waitTime = SHORT_WINDOW - (now - oldestInShortWindow) + 100; // +100ms buffer
      console.log(`⏳ Short rate limit (${recentRequests.length}/${SHORT_LIMIT}), waiting ${waitTime}ms...`);
      await sleep(waitTime);
      return waitForSlot();
    }

    // Check long window (2 minutes)
    if (requestTimestamps.length >= LONG_LIMIT) {
      // Wait until oldest request expires
      const oldest = Math.min(...requestTimestamps);
      const waitTime = LONG_WINDOW - (now - oldest) + 100; // +100ms buffer
      console.log(`⏳ Long rate limit (${requestTimestamps.length}/${LONG_LIMIT}), waiting ${Math.round(waitTime/1000)}s...`);
      await sleep(waitTime);
      return waitForSlot();
    }

    // Record this request
    requestTimestamps.push(Date.now());
  };

  const reset = (): void => {
    requestTimestamps = [];
  };

  return {
    waitForSlot,
    reset,
  };
};
