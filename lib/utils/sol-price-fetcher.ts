/**
 * Utility for fetching SOL price with retry logic, timeouts, and fallbacks
 */

const FALLBACK_SOL_PRICE = 150; // Fallback price in USD
const FETCH_TIMEOUT = 5000; // 5 seconds timeout
const MAX_RETRIES = 3;

interface PriceSource {
  name: string;
  url: string;
  parser: (data: any) => number | null;
}

const PRICE_SOURCES: PriceSource[] = [
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    parser: (data: any) => data?.solana?.usd || null,
  },
  {
    name: 'CoinGecko Alternative',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=false',
    parser: (data: any) => data?.solana?.usd || null,
  },
];

/**
 * Get fetch implementation (works in both browser and Node.js)
 */
function getFetch(): typeof fetch {
  // In browser or Node.js 18+, use native fetch
  if (typeof fetch !== 'undefined') {
    return fetch;
  }
  
  // In older Node.js, try to use node-fetch
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-fetch') as typeof fetch;
  } catch {
    throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch');
  }
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  timeout: number = FETCH_TIMEOUT
): Promise<Response> {
  const fetchFn = getFetch();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal as AbortSignal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'poker-x402/1.0.0',
      },
    } as RequestInit);
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.code === 'UND_ERR_SOCKET') {
      throw new Error(`Request timeout or connection error after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch SOL price from a single source
 */
async function fetchFromSource(source: PriceSource): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(source.url, FETCH_TIMEOUT);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const price = source.parser(data);
    
    if (price && typeof price === 'number' && price > 0) {
      return price;
    }
    
    return null;
  } catch (error: any) {
    // Handle specific error types
    const errorMessage = error.message || error.toString();
    const isSocketError = errorMessage.includes('socket') || 
                         errorMessage.includes('UND_ERR_SOCKET') ||
                         errorMessage.includes('other side closed') ||
                         errorMessage.includes('ECONNRESET') ||
                         errorMessage.includes('ETIMEDOUT');
    
    if (isSocketError) {
      console.warn(`[SOL Price Fetcher] Network error from ${source.name} (socket closed/timeout):`, errorMessage);
    } else {
      console.warn(`[SOL Price Fetcher] Failed to fetch from ${source.name}:`, errorMessage);
    }
    return null;
  }
}

/**
 * Fetch SOL price with retry logic and multiple sources
 * @param retries Number of retries per source (default: 3)
 * @returns SOL price in USD, or fallback price if all sources fail
 */
export async function fetchSolPrice(retries: number = MAX_RETRIES): Promise<number> {
  // Try each source with retries
  for (const source of PRICE_SOURCES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const price = await fetchFromSource(source);
        if (price !== null) {
          console.log(`[SOL Price Fetcher] ✅ Successfully fetched SOL price from ${source.name}: $${price}`);
          return price;
        }
      } catch (error: any) {
        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.warn(`[SOL Price Fetcher] Attempt ${attempt}/${retries} failed for ${source.name}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.warn(`[SOL Price Fetcher] All attempts failed for ${source.name}`);
        }
      }
    }
  }

  // All sources failed, use fallback
  console.warn(`[SOL Price Fetcher] ⚠️  All price sources failed, using fallback price: $${FALLBACK_SOL_PRICE}`);
  return FALLBACK_SOL_PRICE;
}

/**
 * Cached SOL price fetcher (caches for 5 minutes)
 */
let cachedPrice: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedSolPrice(): Promise<number> {
  const now = Date.now();
  
  // Return cached price if still valid
  if (cachedPrice !== null && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedPrice;
  }

  // Fetch new price
  try {
    cachedPrice = await fetchSolPrice();
    cacheTimestamp = now;
    return cachedPrice;
  } catch (error) {
    // If fetch fails and we have a cached price, use it even if expired
    if (cachedPrice !== null) {
      console.warn('[SOL Price Fetcher] Using expired cache due to fetch failure');
      return cachedPrice;
    }
    // No cache available, return fallback
    return FALLBACK_SOL_PRICE;
  }
}

/**
 * Clear the price cache (useful for testing or forced refresh)
 */
export function clearPriceCache(): void {
  cachedPrice = null;
  cacheTimestamp = 0;
}

