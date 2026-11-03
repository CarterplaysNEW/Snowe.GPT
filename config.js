// ===== SNOWE.GPT settings =====
// This file is public on GitHub. NEVER put your Groq API key in here.
// The key lives in your Cloudflare Worker (see README.md).

window.SNOWE_CONFIG = {
  // Paste your Cloudflare Worker URL here, e.g. "https://snowe-brain.yourname.workers.dev"
  WORKER_URL: "",

  // Message usage: each person gets MESSAGE_LIMIT messages every WINDOW_HOURS hours.
  MESSAGE_LIMIT: 25,
  WINDOW_HOURS: 3,

  // When a long answer (like big code) gets cut off, SNOWE keeps going on his own
  // up to this many times, as long as there are messages left. Each one costs 1 message.
  AUTO_CONTINUES: 3,

  // The brains. "model" must also be allowed in worker.js.
  BRAINS: {
    quick:   { name: "Snowball", model: "llama-3.1-8b-instant",    note: "fast, a bit silly" },
    default: { name: "Snowman",  model: "llama-3.3-70b-versatile", note: "smart, balanced" },
    complex: { name: "Blizzard", model: "openai/gpt-oss-20b",      note: "best at code and maths, slower" }
  },
  DEFAULT_BRAIN: "default"
};
