// ===== SNOWE.GPT settings =====
// This file is public on GitHub. NEVER put your Groq API key in here.
// The key lives in your Cloudflare Worker (see README.md).

window.SNOWE_CONFIG = {
  // Paste your Cloudflare Worker URL here, e.g. "https://snowe-brain.yourname.workers.dev"
  WORKER_URL: "https://snowe-api.carterplays648.workers.dev",

  // Message usage: each person gets MESSAGE_LIMIT messages every WINDOW_HOURS hours.
  MESSAGE_LIMIT: 25,
  WINDOW_HOURS: 3,

  // When a long answer (like big code) gets cut off, SNOWE keeps going on his own
  // up to this many times, as long as there are messages left. Each one costs 1 message.
  AUTO_CONTINUES: 3,

  // The brains. If your Groq key does not have a model, the worker picks one it does have.
  // search: how hard each brain researches the web: "quick", "normal" or "deep".
  BRAINS: {
    quick:   { name: "Snowball", model: "allam-2-7b",              note: "fast, a bit silly",              search: "quick" },
    default: { name: "Snowman",  model: "qwen/qwen3.8-27b",        note: "smart, balanced",                search: "normal" },
    complex: { name: "Blizzard", model: "openai/gpt-oss-20b",      note: "best at code and maths, slower", search: "normal" }
  },
  DEFAULT_BRAIN: "default",

  // The secret best brain. Buy it in the SnowCoin shop. It lasts MINUTES, then melts.
  // (Uses the 120b model if your Groq key has it.)
  PREMIUM: { key: "avalanche", name: "Avalanche", model: "openai/gpt-oss-120b", note: "the smartest SNOWE", PRICE: 500, MINUTES: 60, search: "deep" },

  // SnowCoins: SNOWE gives you coins when you're nice, and takes some if you're rude.
  COINS: { START: 0, MAX_GAIN: 50, MAX_LOSS: 20 }
};
