// SNOWE.GPT brain proxy — a Cloudflare Worker.
// It keeps your Groq API key secret and only lets your website use it.
//
// Settings in Cloudflare (Worker -> Settings -> Variables and Secrets):
//   GROQ_API_KEY    (type: Secret)  your key from https://console.groq.com/keys
//   ALLOWED_ORIGIN  (type: Text)    your site, e.g. https://yourname.github.io   (no slash at the end)

// Only these models can be used, and each answer is capped so nobody can drain your key.
const MODELS = {
  "llama-3.1-8b-instant":    { max_tokens: 1500 },
  "llama-3.3-70b-versatile": { max_tokens: 1500 },
  "openai/gpt-oss-20b":      { max_tokens: 3000, extra: { reasoning_effort: "low" } }
};
const MAX_MESSAGES = 40;
const MAX_CHARS = 60000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const okOrigin = allowed === "*" || origin === allowed || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? (origin || "*") : allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const reply = (status, msg) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return reply(405, "Use POST");
    if (!okOrigin) return reply(403, "This brain only works on the SNOWE.GPT website");
    if (!env.GROQ_API_KEY) return reply(500, "GROQ_API_KEY is not set on the worker");

    let body;
    try { body = await request.json(); } catch { return reply(400, "Bad JSON"); }

    const cfg = MODELS[body.model];
    if (!cfg) return reply(400, "That brain isn't allowed");
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length || msgs.length > MAX_MESSAGES) return reply(400, "Too many or too few messages");
    let total = 0;
    for (const m of msgs) {
      if (!["system", "user", "assistant"].includes(m?.role) || typeof m.content !== "string") return reply(400, "Bad message");
      total += m.content.length;
    }
    if (total > MAX_CHARS) return reply(413, "Chat is too long");

    const groq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: 0.7,
        max_tokens: cfg.max_tokens,
        ...(cfg.extra || {})
      })
    });

    if (!groq.ok) {
      const text = await groq.text();
      return reply(groq.status, groq.status === 429 ? "Too many people are using SNOWE right now" : text.slice(0, 300));
    }
    return new Response(groq.body, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
};
