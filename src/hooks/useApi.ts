import axios from "axios";

// Environment variables
// Defining base URL and other constants from environment variables
const BASE_URL = import.meta.env.VITE_BACKEND_URL as string;
//! const API_KEY = import.meta.env.VITE_API_KEY as string; Not currently in use
const PROXY_URL = import.meta.env.VITE_PROXY_URL as string;
const IS_LOCAL = import.meta.env.VITE_IS_LOCAL as string;
const LOCAL_IP = import.meta.env.VITE_LOCAL_IP as string || "localhost";
const PORT: number = import.meta.env.PORT ? parseInt(import.meta.env.PORT) : 5173;

// Axios instance
// Creating axios instance with proxy server base URL
const PROXY_SERVER_BASE_URL = IS_LOCAL == "true"
  ? `http://${LOCAL_IP}:${PORT}/api/json`
  : `${PROXY_URL}/api/json`;

const axiosInstance = axios.create({
  baseURL: PROXY_SERVER_BASE_URL,
  timeout: 10000,
});

// Error handling function
// Function to handle errors and throw appropriately
function handleError(error: any, context: string) {
  let errorMessage = "An error occurred";

  switch (context) {
    case "data":
      errorMessage = "Error fetching data";
      break;
    case "anime episodes":
      errorMessage = "Error fetching anime episodes";
      break;
    case "episode video URLs":
      errorMessage = "Error fetching episode video URLs";
      break;
    default:
      errorMessage = "Unknown error occurred";
      break;
  }

  if (error.response && error.response.data && error.response.data.message) {
    errorMessage += `: ${error.response.data.message}`;
  } else if (error.message) {
    errorMessage += `: ${error.message}`;
  }

  console.error(`${errorMessage}`, error);
  throw new Error(errorMessage);
}

// Cache key generator
// Function to generate cache key from arguments
function generateCacheKey(...args: string[]) {
  return args.join("-");
}

interface CacheItem {
  value: any; // Replace 'any' with a more specific type if possible
  timestamp: number;
}

// Session storage cache creation
// Function to create a cache in session storage
function createOptimizedSessionStorageCache(maxSize: number, maxAge: number, cacheKey: string) {
  const cache = new Map<string, CacheItem>(JSON.parse(sessionStorage.getItem(cacheKey) || '[]'));
  const keys = new Set<string>(cache.keys());

  function isItemExpired(item: CacheItem) {
    return Date.now() - item.timestamp > maxAge;
  }

  function updateSessionStorage() {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify(Array.from(cache.entries()))
    );
  }

  return {
    get(key: string) {
      if (cache.has(key)) {
        const item = cache.get(key);
        if (!isItemExpired(item!)) {
          keys.delete(key);
          keys.add(key);
          return item!.value;
        }
        cache.delete(key);
        keys.delete(key);
      }
      return undefined;
    },
    set(key: string, value: any) {
      if (cache.size >= maxSize) {
        const oldestKey = keys.values().next().value;
        cache.delete(oldestKey);
        keys.delete(oldestKey);
      }
      keys.add(key);
      cache.set(key, { value, timestamp: Date.now() });
      updateSessionStorage();
    },
  };
}

// Constants for cache configuration
// Cache size and max age constants
const CACHE_SIZE = 10;
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Factory function for cache creation
// Function to create cache with given cache key
function createCache(cacheKey: string) {
  return createOptimizedSessionStorageCache(
    CACHE_SIZE,
    CACHE_MAX_AGE,
    cacheKey
  );
}

interface FetchOptions {
  type?: string;
  season?: string;
  format?: string;
  sort?: string[];
  genres?: string[];
  id?: string;
  year?: string;
  status?: string;
}

// Individual caches for different types of data
// Creating caches for anime data, anime info, and video sources
const advancedSearchCache = createCache("Advanced Search");
const animeDataCache = createCache("Data");
const animeEpisodesCache = createCache("Episodes");
const fetchAnimeEmbeddedEpisodesCache = createCache("Video Embedded Sources");
const videoSourcesCache = createCache("Video Sources");

// Fetch data from proxy with caching
// Function to fetch data from proxy with caching
async function fetchFromProxy(url: string, cache: any, cacheKey: string) {
  try {
    // Attempt to retrieve the cached response using the cacheKey
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      // console.log(`Serving from cache for key: ${cacheKey}`); // Debugging: Confirming cache hit
      return cachedResponse; // Return the cached response if available
    }

    // Proceed with the network request if no cached response is found
    const response = await axiosInstance.get('', { params: { url } }); // Adjust based on how the proxy expects to receive the original URL

    // After obtaining the response, verify it for errors or empty data as before
    if (response.status !== 200 || (response.data.statusCode && response.data.statusCode >= 400)) {
      const errorMessage = response.data.message || 'Unknown server error';
      throw new Error(`Server error: ${response.data.statusCode || response.status} ${errorMessage}`);
    }

    // Assuming response data is valid, store it in the cache
    cache.set(cacheKey, response.data); // Cache the new data using the cacheKey
    // console.log(`Caching new data for key: ${cacheKey}`); // Debugging: Confirming new data is cached

    return response.data; // Return the newly fetched data
  } catch (error) {
    // Handle errors from Axios or due to invalid responses
    handleError(error, "data");
    throw error; // Rethrow the error for the caller to handle
  }
}


// Function to fetch anime data
export async function fetchAdvancedSearch(
  searchQuery: string = "",
  page: number = 1,
  perPage: number = 16,
  options: FetchOptions = {}
) {
  const queryParams = new URLSearchParams({
    ...(searchQuery && { query: searchQuery }),
    page: page.toString(),
    perPage: perPage.toString(),
    type: options.type ?? "ANIME",
    ...(options.season && { season: options.season }),
    ...(options.format && { format: options.format }),
    ...(options.id && { id: options.id }),
    ...(options.year && { year: options.year }),
    ...(options.status && { status: options.status }),
    ...(options.sort && { sort: JSON.stringify(options.sort) }),
    ...(options.genres && options.genres.length > 0 && { genres: options.genres.filter((g: string) => g).join(",") }),
  });

  const url = `${BASE_URL}meta/anilist/advanced-search?${queryParams.toString()}`;
  const cacheKey = generateCacheKey("advancedSearch", queryParams.toString());

  return fetchFromProxy(url, advancedSearchCache, cacheKey);
}

// Fetch Anime DATA Function
export async function fetchAnimeData(animeId: string, provider: string = "gogoanime") {
  const params = new URLSearchParams({ provider });
  const url = `${BASE_URL}meta/anilist/data/${animeId}?${params.toString()}`;
  const cacheKey = generateCacheKey('animeData', animeId, provider);

  return fetchFromProxy(url, animeDataCache, cacheKey);
}


// Fetch Anime INFO Function
export async function fetchAnimeInfo(animeId: string, provider: string = "gogoanime") {
  const params = new URLSearchParams({ provider });
  const url = `${BASE_URL}meta/anilist/info/${animeId}?${params.toString()}`;
  const cacheKey = generateCacheKey('animeInfo', animeId, provider);

  return fetchFromProxy(url, animeEpisodesCache, cacheKey);
}

// export async function fetchAnimeInfo(animeId: string, provider: string = "gogoanime") {
//   const cacheKey = generateCacheKey('animeInfo', animeId, provider);

//   try {

//         // Check if data is in cache
//         const cachedData = animeEpisodesCache.get(cacheKey);
//         if (cachedData) {
//           return cachedData;
//         }

//     // If not in cache, fetch the data
//     const url = `${BASE_URL}meta/anilist/info/${animeId}`;
//     const params = new URLSearchParams({ provider });
//     const response = await axiosInstance.get(`${url}?${params.toString()}`);
//     const data = response.data;

//     // Store data in cache
//     animeEpisodesCache.set(cacheKey, data.episodes);
//     return data.episodes;
//   } catch (error) {
//     handleError(error, "anime info");
//   }
// } 


// Function to fetch list of anime based on type (Top, Trending, Popular)
async function fetchList(type: string, page: number = 1, perPage: number = 16, options: FetchOptions = {}) {
  let cacheKey: string;
  let url: string;
  let params = new URLSearchParams({ page: page.toString(), perPage: perPage.toString() });

  if (["Top", "Trending", "Popular"].includes(type)) {
    cacheKey = generateCacheKey(`${type}Anime`, page.toString(), perPage.toString());
    url = `${BASE_URL}meta/anilist/${type.toLowerCase()}`;

    if (type === "Top") {
      options = {
        type: "ANIME",
        sort: ['["SCORE_DESC"]'],
      };
      url = `${BASE_URL}meta/anilist/advanced-search?type=${options.type}&sort=${options.sort}&`;
    }
  } else {
    // Default values for cacheKey and url if not "Top", "Trending", or "Popular"
    cacheKey = generateCacheKey(`${type}Anime`, page.toString(), perPage.toString());
    url = `${BASE_URL}meta/anilist/${type.toLowerCase()}`;
    // params already defined above
  }

  const specificCache = createCache(`${type}`);
  return fetchFromProxy(`${url}?${params.toString()}`, specificCache, cacheKey);
}

// Functions to fetch top, trending, and popular anime
export const fetchTopAnime = (page: number, perPage: number) => fetchList("Top", page, perPage);
export const fetchTrendingAnime = (page: number, perPage: number) => fetchList("Trending", page, perPage);
export const fetchPopularAnime = (page: number, perPage: number) => fetchList("Popular", page, perPage);


// Fetch Anime Episodes Function
export async function fetchAnimeEpisodes(animeId: string, provider: string = "gogoanime", dub: boolean = false) {
  const params = new URLSearchParams({ provider, dub: dub ? "true" : "false" });
  const url = `${BASE_URL}meta/anilist/episodes/${animeId}?${params.toString()}`;
  const cacheKey = generateCacheKey('animeEpisodes', animeId, provider, dub ? "dub" : "sub");

  return fetchFromProxy(url, animeEpisodesCache, cacheKey);
}

// Fetch Embedded Anime Episodes Servers
export async function fetchAnimeEmbeddedEpisodes(episodeId: string) {
  const url = `${BASE_URL}meta/anilist/servers/${episodeId}`;
  console.log("Fetching servers from URL:", url); // Debugging log
  const cacheKey = generateCacheKey('animeEmbeddedServers', episodeId);

  return fetchFromProxy(url, fetchAnimeEmbeddedEpisodesCache, cacheKey);

}

// Function to fetch anime streaming links
export async function fetchAnimeStreamingLinks(episodeId: string) {
  const url = `${BASE_URL}meta/anilist/watch/${episodeId}`;
  const cacheKey = generateCacheKey('animeStreamingLinks', episodeId);

  return fetchFromProxy(url, videoSourcesCache, cacheKey);
}