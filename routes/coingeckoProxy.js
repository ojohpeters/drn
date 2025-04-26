const express = require("express");
const axios = require("axios");
const router = express.Router();

const cache = new Map();
const CACHE_TTL = 60 * 1000; // Cache for 1 minute
const RATE_LIMIT_DELAY = 1200; // Delay between requests to CoinGecko in milliseconds
let lastRequestTimestamp = 0;

// Proxy route for CoinGecko API
router.get("/coingecko/simple/price", async (req, res) => {
  const { ids, vs_currencies } = req.query;

  if (!ids || !vs_currencies) {
    return res.status(400).json({ error: "Missing required query parameters." });
  }

  const cacheKey = `${ids}-${vs_currencies}`;
  const cachedData = cache.get(cacheKey);

  // Return cached data if available and not expired
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return res.status(200).json(cachedData.data);
  }

  // Enforce rate limiting
  const now = Date.now();
  if (now - lastRequestTimestamp < RATE_LIMIT_DELAY) {
    return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
  }

  lastRequestTimestamp = now;

  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
      params: { ids, vs_currencies },
    });

    // Cache the response
    cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching CoinGecko data:", error.message);
    res.status(500).json({ error: "Unable to fetch data from CoinGecko." });
  }
});

module.exports = router;
