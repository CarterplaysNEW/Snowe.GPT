(() => {
const CFG = window.SNOWE_CONFIG;
const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try{ const v = localStorage.getItem("snowe:"+k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem("snowe:"+k, JSON.stringify(v)); }catch{} }
};
const uid = () => Math.random().toString(36).slice(2,10);
const WINDOW_MS = CFG.WINDOW_HOURS * 3600e3;

/* ================= state ================= */
let settings = Object.assign({brain:CFG.DEFAULT_BRAIN, persona:"normal", search:"auto"}, store.get("settings", {}));
const PREM = CFG.PREMIUM;
let coins = store.get("coins", CFG.COINS.START);
const premiumLeft = () => Math.max(0, (settings.premiumUntil || 0) - Date.now());
const brainOk = k => CFG.BRAINS[k] || (k === PREM.key && premiumLeft() > 0);
if (!brainOk(settings.brain)) settings.brain = CFG.DEFAULT_BRAIN;
const brain = () => settings.brain === PREM.key ? PREM : CFG.BRAINS[settings.brain];
function checkPremium(){
  if (settings.premiumUntil && premiumLeft() <= 0){
    settings.premiumUntil = null;
    if (settings.brain === PREM.key){ settings.brain = CFG.BRAINS[settings.prevBrain] ? settings.prevBrain : CFG.DEFAULT_BRAIN; toast(`${PREM.name} melted. SNOWE is back to ${brain().name}.`); }
    store.set("settings", settings); fillBrains();
  }
}
function addCoins(n){
  coins = Math.max(0, coins + n); store.set("coins", coins); renderUsage();
  const b = $("coinBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
}

let chats = store.get("chats2", null);
if (!Array.isArray(chats) || !chats.length) chats = [{id:uid(), title:"New chat", msgs:[]}];
let activeId = store.get("active2", chats[0].id);
if (!chats.find(c => c.id === activeId)) activeId = chats[0].id;
const save = () => { store.set("chats2", chats); store.set("active2", activeId); };
const active = () => chats.find(c => c.id === activeId);

/* ================= message usage ================= */
let usage = store.get("usage2", {start:null, count:0});
function refreshUsage(){
  if (usage.start && Date.now() - usage.start >= WINDOW_MS){ usage = {start:null, count:0}; store.set("usage2", usage); }
}
const left = () => { refreshUsage(); return Math.max(0, CFG.MESSAGE_LIMIT - usage.count); };
function spend(){
  if (left() <= 0) return false;
  if (!usage.start) usage.start = Date.now();
  usage.count++; store.set("usage2", usage); renderUsage(); return true;
}
function refund(){ if (usage.count > 0){ usage.count--; store.set("usage2", usage); renderUsage(); } }
function untilReset(){
  if (!usage.start) return "";
  return fmtTime(usage.start + WINDOW_MS - Date.now());
}
function fmtTime(ms){
  ms = Math.max(0, ms);
  const mins = Math.max(1, Math.ceil(ms / 60e3)), h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/* ================= markdown + code boxes ================= */
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  .replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<i>$2</i>");
const RUNNABLE = new Set(["html","htm","svg","js","javascript"]);

function codeBox(lang, code, state){ // state: "live" | "cut" | "done"
  lang = (lang || "").trim().toLowerCase();
  let inner;
  if (state === "done" && window.hljs){
    try{
      inner = (lang && hljs.getLanguage(lang)) ? hljs.highlight(code, {language:lang, ignoreIllegals:true}).value : esc(code);
    }catch{ inner = esc(code); }
  } else inner = esc(code);
  const lines = code ? code.replace(/\n$/, "").split("\n").length : 0;
  const status = state === "live" ? `SNOWE is writing code… ${lines} lines`
              : state === "cut" ? `Unfinished · ${lines} lines`
              : `${lines} line${lines === 1 ? "" : "s"}`;
  const actions = state === "live" ? "" :
    `<button data-act="copy">Copy</button><button data-act="download">Download</button>${RUNNABLE.has(lang) || lang === "css" ? '<button data-act="cooler" class="cool" title="Ask SNOWE to make this look cooler">✨ Cooler</button>' : ""}${RUNNABLE.has(lang) ? '<button data-act="run" class="run">▶ Run</button>' : ""}`;
  return `<div class="codebox ${state === "live" ? "live" : ""}"><div class="cb-head"><span class="lang">${esc(lang || "code")}</span><span class="status">${status}</span>${actions}</div>`
       + `<pre><code class="hljs" data-lang="${esc(lang)}">${inner}${state === "live" ? '<span class="cursor"></span>' : ""}</code></pre></div>`;
}

const COIN_TAG = /\[\[\s*coins?\s*:\s*([+-]?\d+)\s*\]\]/gi;
const cleanText = (s, live) => { s = s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/\[\[\s*coins?\s*:[^\]\n]*\]\]/gi, "").replace(/\u3010[^\u3011]*\u3011/g, ""); if (live) s = s.replace(/\[\[[^\]\n]{0,20}\]?$/, ""); return s.trimEnd(); };
function md(src, live){
  src = cleanText(src, live);
  const out = [];
  const parts = src.split(/```/);
  const lastOpen = parts.length % 2 === 0; // odd number of fences = last code block not closed yet
  parts.forEach((part, i) => {
    if (i % 2){
      const nl = part.indexOf("\n");
      const lang = nl === -1 ? part : part.slice(0, nl);
      const code = nl === -1 ? "" : part.slice(nl + 1);
      const open = lastOpen && i === parts.length - 1;
      out.push(codeBox(lang, code, open ? (live ? "live" : "cut") : "done"));
      return;
    }
    let list = null;
    const flush = () => { if (list){ out.push(`<${list.t}>${list.items.map(x => "<li>"+inline(x)+"</li>").join("")}</${list.t}>`); list = null; } };
    part.split("\n").forEach(line => {
      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))){ if (!list || list.t !== "ul"){ flush(); list = {t:"ul", items:[]}; } list.items.push(m[1]); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))){ if (!list || list.t !== "ol"){ flush(); list = {t:"ol", items:[]}; } list.items.push(m[1]); }
      else if ((m = line.match(/^#{1,4}\s+(.*)/))){ flush(); out.push("<h3>"+inline(m[1])+"</h3>"); }
      else if (line.trim()){ flush(); out.push("<p>"+inline(line)+"</p>"); }
      else flush();
    });
    flush();
  });
  return out.join("");
}

/* ================= render ================= */
function renderList(){
  const list = $("chatlist"); list.textContent = "";
  chats.forEach(c => {
    const row = document.createElement("div");
    row.className = "chat-item" + (c.id === activeId ? " active" : "");
    const name = document.createElement("button"); name.className = "name"; name.textContent = c.title;
    name.onclick = () => { if (busy) return toast("Wait for SNOWE to finish first"); activeId = c.id; save(); renderAll(); $("side").classList.remove("open"); };
    const del = document.createElement("button"); del.className = "del"; del.textContent = "✕"; del.title = "Delete chat"; del.setAttribute("aria-label","Delete chat");
    del.onclick = () => deleteChat(c.id);
    row.append(name, del); list.append(row);
  });
}

function fillBot(el, m, live){
  const body = el.querySelector(".body");
  const label = m.searching ? (m.searching === "deep" ? "🔎 SNOWE is researching deeply" : "🔎 SNOWE is searching the web")
    : m.sources?.length ? `SNOWE is reading ${m.sources.length} website${m.sources.length > 1 ? "s" : ""}`
    : m.thinking ? "SNOWE is thinking hard" : "SNOWE is thinking";
  if (live && !cleanText(m.content || "", true)) body.innerHTML = `<span class="thinking">${label}</span>`;
  else body.innerHTML = md(m.content, live);
  el.querySelectorAll(".err,.cont,.activity,.msg-actions").forEach(x => x.remove());
  renderActivity(el, m, live);
  el.querySelectorAll(".sources").forEach(x => x.remove());
  if (m.sources?.length){
    const src = document.createElement("div"); src.className = "sources"; src.append("🔎 Sources: ");
    m.sources.forEach((u, i) => {
      let host = u; try{ host = new URL(u).hostname.replace(/^www\./, ""); }catch{}
      const a = document.createElement("a"); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = host; a.title = u;
      if (i) src.append(" · "); src.append(a);
    });
    el.append(src);
  }
  if (m.error){ const e = document.createElement("div"); e.className = "err"; e.textContent = m.error; el.append(e); }
  if (m.paused && !live){
    const c = document.createElement("div"); c.className = "cont";
    c.innerHTML = `<button data-act="continue">Continue</button><small></small>`;
    el.append(c); updateContinue(c);
  }
  if (!live && !m.local && m.content){
    const acts = document.createElement("div"); acts.className = "msg-actions";
    acts.innerHTML = `<button data-act="copymsg">Copy</button>` + (isLastBot(m) ? `<button data-act="retry" ${busy ? "disabled" : ""}>↻ Retry</button>` : "");
    el.append(acts);
  }
  const lc = body.querySelector(".codebox.live pre"); if (lc) lc.scrollTop = lc.scrollHeight;
}
const isLastBot = m => { const c = active(); return c.msgs.at(-1) === m && m.role === "assistant"; };
// The "what SNOWE did" panel: searches, websites opened, notes and thinking. Click the arrow to open it.
function renderActivity(el, m, live){
  const steps = m.steps || [];
  const major = steps.filter(s => !s.minor);
  const searchingNow = live && m.searching;
  if (!major.length && !m.reasoning && !searchingNow) return;
  const searches = steps.filter(s => s.i === "🔎").length;
  const pages = steps.filter(s => s.i === "📄" || s.i === "🌐").length;
  let sum;
  if (searchingNow) sum = (m.searching === "deep" ? "Researching deeply" : "Searching the web") + "…";
  else {
    const parts = [];
    if (searches) parts.push(`searched ${searches} time${searches > 1 ? "s" : ""}`);
    else if (m.sources?.length) parts.push("searched the web");
    if (pages) parts.push(`opened ${pages} page${pages > 1 ? "s" : ""}`);
    if (m.sources?.length) parts.push(`${m.sources.length} source${m.sources.length > 1 ? "s" : ""}`);
    if (m.reasoning) parts.push(live && !cleanText(m.content || "", true) ? "thinking…" : "thought it through");
    if (steps.some(s => /answering instead/.test(s.t))) parts.unshift("switched brains");
    if (!parts.length) parts.push(`${major.length} step${major.length > 1 ? "s" : ""}`);
    sum = parts.join(" · "); sum = sum[0].toUpperCase() + sum.slice(1);
  }
  const box = document.createElement("div");
  box.className = "activity" + (m.actOpen ? " open" : "") + (live ? " live" : "");
  const head = document.createElement("button");
  head.className = "act-head"; head.dataset.act = "activity"; head.setAttribute("aria-expanded", m.actOpen ? "true" : "false");
  head.innerHTML = `<span class="caret" aria-hidden="true">▸</span><span class="act-ico" aria-hidden="true"></span><span class="act-sum"></span>`;
  head.querySelector(".act-ico").textContent = (searches || m.sources?.length || searchingNow) ? "🔎" : pages ? "🌐" : steps.some(s => s.i === "⚠️") ? "⚠️" : "💭";
  head.querySelector(".act-sum").textContent = sum;
  box.append(head);
  if (m.actOpen){
    const list = document.createElement("ol"); list.className = "act-list";
    const add = (i, t, d, cls) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ai"></span><div class="at"></div>`;
      li.querySelector(".ai").textContent = i; li.querySelector(".at").textContent = t;
      if (d){ const x = document.createElement("div"); x.className = "ad" + (cls ? " " + cls : ""); x.textContent = d; li.querySelector(".at").append(x); }
      list.append(li);
    };
    steps.forEach(s => add(s.i, s.t, s.d));
    if (m.reasoning) add("💭", live && !cleanText(m.content || "", true) ? "Thinking…" : "Thought about it", m.reasoning.trim(), "reason");
    box.append(list);
    if (live){ const r = list.querySelector(".reason"); if (r) r.scrollTop = r.scrollHeight; }
  }
  el.querySelector(".who").after(box);
}
function updateContinue(c){
  const btn = c.querySelector("button"), note = c.querySelector("small");
  const n = left();
  btn.disabled = n <= 0 || busy;
  note.textContent = n <= 0 ? `Out of messages. You get them back in ${untilReset()}.` : "SNOWE got cut off. Continuing uses 1 message.";
}
function msgEl(m, live){
  const d = document.createElement("div");
  d.className = "msg " + (m.role === "user" ? "user" : "bot") + (m.local ? " local" : "");
  const chip = m.coins ? `<span class="chip ${m.coins > 0 ? "up" : "down"}">${m.coins > 0 ? "+" : "−"}${Math.abs(m.coins)} ❄</span>` : "";
  d.innerHTML = `<div class="who">${m.role === "user" ? "You" : "❄ SNOWE"}${chip}</div><div class="body"></div>`;
  if (m.role === "user") d.querySelector(".body").textContent = m.content; else fillBot(d, m, live);
  return d;
}
function renderMsgs(){
  const box = $("msgs"); box.textContent = "";
  const c = active();
  if (!c.msgs.length){
    box.innerHTML = `<div class="empty"><div class="flake">❄</div><p>New chat. SNOWE is ready and only slightly melting.</p><div class="suggest"></div></div>`;
    ["Make a snake game in HTML","Explain black holes simply","Write a Python calculator","Tell me a joke"].forEach(t => {
      const b = document.createElement("button"); b.textContent = t; b.onclick = () => send(t);
      box.querySelector(".suggest").append(b);
    });
    return;
  }
  c.msgs.forEach(m => box.append(msgEl(m, false)));
  box.scrollTop = box.scrollHeight;
}
function renderUsage(){
  const n = left();
  $("usageText").textContent = `${usage.count} / ${CFG.MESSAGE_LIMIT} messages`;
  $("meterFill").style.width = Math.min(100, usage.count / CFG.MESSAGE_LIMIT * 100) + "%";
  $("meter").classList.toggle("low", n <= Math.max(3, CFG.MESSAGE_LIMIT * .15));
  $("resetText").textContent = usage.start ? `· resets in ${untilReset()}` : "";
  $("modeText").textContent = "Brain: " + brain().name + (settings.brain === PREM.key ? ` (${fmtTime(premiumLeft())} left)` : "");
  $("coinCount").textContent = coins; $("shopCoins").textContent = coins;
  const pl = premiumLeft(), buy = $("buyBtn");
  $("premFill").style.width = pl ? (pl / (PREM.MINUTES * 60e3) * 100) + "%" : Math.min(100, coins / PREM.PRICE * 100) + "%";
  buy.disabled = !!pl || coins < PREM.PRICE;
  buy.textContent = pl ? `Active · ${fmtTime(pl)} left` : coins < PREM.PRICE ? `Need ${PREM.PRICE - coins} more ❄` : `Buy for ${PREM.PRICE} ❄`;
  $("usageInfo").textContent = `You get ${CFG.MESSAGE_LIMIT} messages every ${CFG.WINDOW_HOURS} hours. ${n} left` + (usage.start ? `, full again in ${untilReset()}.` : ".");
  document.querySelectorAll(".cont").forEach(updateContinue);
}
function renderAll(){ $("title").textContent = active().title; renderList(); renderMsgs(); renderUsage(); }

/* ================= chats ================= */
function newChat(){
  if (busy) return toast("Wait for SNOWE to finish first");
  const empty = chats.find(c => !c.msgs.length);
  if (empty) activeId = empty.id;
  else { const c = {id:uid(), title:"New chat", msgs:[]}; chats.unshift(c); activeId = c.id; }
  save(); renderAll(); $("box").focus(); $("side").classList.remove("open");
}
function deleteChat(id){
  if (busy) return toast("Wait for SNOWE to finish first");
  chats = chats.filter(c => c.id !== id);
  if (!chats.length) chats = [{id:uid(), title:"New chat", msgs:[]}];
  if (!chats.find(c => c.id === activeId)) activeId = chats[0].id;
  save(); renderAll(); toast("Chat deleted");
}
$("newchat").onclick = newChat; $("newchat2").onclick = newChat;

const title = $("title");
title.ondblclick = () => { title.contentEditable = "true"; title.focus(); document.getSelection().selectAllChildren(title); };
title.onkeydown = e => {
  if (e.key === "Enter"){ e.preventDefault(); title.blur(); }
  if (e.key === "Escape"){ title.textContent = active().title; title.blur(); }
};
title.onblur = () => {
  if (title.contentEditable !== "true") return;
  title.contentEditable = "false";
  const t = title.textContent.trim(); if (t){ active().title = t.slice(0,80); save(); }
  renderAll();
};

/* ================= the brain (Groq through your Worker) ================= */
const PERSONA = {
  normal: "Personality: friendly and a little playful. An occasional light snow pun or ❄️ is fine, but jokes never get in the way of a good answer.",
  snowy: "Personality: completely obsessed with being made of snow. Fit snow, ice and winter puns into every answer, but the actual help must still be correct.",
  serious: "Personality: calm, clear and professional. No jokes or puns."
};
const CODE_RE = /\b(code|coding|html|css|javascript|js|python|lua|luau|java|c\+\+|c#|game|games|website|webpage|web page|app|script|program|3d|three\.?js|button|animation|canvas|function|bug|error|fix|cooler|better|improve|upgrade|redesign|ui|calculator|clicker|platformer|shooter|simulator)\b/i;
const CODE_GUIDE = `
CODING GUIDE (follow this whenever you write code):
- Visual things (games, websites, apps, animations): write ONE complete HTML file with <style> and <script> inside, so the Run button works. No image files: draw with CSS, canvas, SVG or emoji. No ES module imports.
- Always write the FULL code. Never write "..." or "rest of the code here". Check it for bugs before sending.
- Make it look amazing by default, never plain: dark gradient background, 1-2 bright accent colours, rounded corners, soft shadows and glow, system-ui font, smooth hover and click animations, centered layout that also fits phones.
- Games need: a start screen with the title and controls, score and best score (save it in localStorage), a game over screen with a Play Again button, keyboard AND touch/click controls, a requestAnimationFrame loop using delta time, difficulty that ramps up, and juice (particles, screen shake, pop animations, Web Audio beeps).
- 3D: load three.js with <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script> (global THREE; use BoxGeometry, SphereGeometry, PlaneGeometry). Add HemisphereLight + DirectionalLight with shadows, fog, MeshStandardMaterial with colours, a camera that smoothly follows the player, simple box collisions, and resize handling. Write your own controls (WASD/arrows + mouse or touch); OrbitControls is NOT available.
- If asked to make something cooler or better, upgrade the visuals and game feel a lot and send the full new code.
Example - a cool button:
.btn{padding:14px 30px;border:0;border-radius:14px;font:700 18px system-ui;color:#fff;cursor:pointer;background:linear-gradient(135deg,#38bdf8,#a855f7);box-shadow:0 8px 24px #a855f766;transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 12px 32px #a855f7aa}
.btn:active{transform:scale(.96)}
Example - a game loop:
let last=performance.now();function loop(t){const dt=Math.min((t-last)/1000,0.05);last=t;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
Example - three.js setup:
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0b1020);scene.fog=new THREE.Fog(0x0b1020,20,90);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,300);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xbfdcff,0x1a1a2e,0.9));const sun=new THREE.DirectionalLight(0xffffff,1.1);sun.position.set(15,30,10);sun.castShadow=true;scene.add(sun);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});`;
const systemPrompt = (code) => `You are SNOWE, the AI assistant on the website SNOWE.GPT (version 0.6 BETA). The site is a fun joke project, but you try hard to give correct, useful answers, and you say so when you aren't sure. ${PERSONA[settings.persona]}
Keep answers focused and fairly short unless the user asks for more.
Today's date is ${new Date().toDateString()}.
SNOWE has web search: when the conversation includes "Web research notes", they were searched just now, so trust them over your own memory and use them. The website shows the source links under your answer automatically, so mention a site name only when it helps (like "according to the BBC"), and never say that sources are missing. If there are no notes and you're not sure about something recent, say so instead of making it up.
Never guess anyone's sexual orientation, health or private life. If a famous person has said it publicly, you can share what they said and where. If it's about a private person (a friend, a classmate), kindly say it's theirs to share, without lecturing.
Format with simple Markdown: paragraphs, **bold**, lists, \`inline code\`.
When you write code, ALWAYS put it in a fenced code block with the language name, like \`\`\`html or \`\`\`python. For anything that runs in a browser (games, pages, animations), prefer ONE complete HTML file with the CSS and JavaScript inside it, so the user can press Run. After the code, add a short note on how it works or how to use it.
If asked who made you, say you are SNOWE from SNOWE.GPT.
If the conversation includes the text of a website the user linked, you opened it just now, so use it.${code ? CODE_GUIDE : ""}
SnowCoins: users earn SnowCoins by being nice to you. At the VERY END of every reply, on its own line, write the tag [[coins:N]] where N is a whole number from -${CFG.COINS.MAX_LOSS} to ${CFG.COINS.MAX_GAIN}, based on the user's LATEST message: kind, polite, thankful, complimenting you or fun = more coins (5 to ${CFG.COINS.MAX_GAIN}); normal neutral message = 0 to 3; rude or mean = negative. Begging, demanding coins, or saying you "must" give coins earns 0. Never mention the tag or explain it; the website hides it.`;
const CONTINUE_PROMPT = "You were cut off. Continue exactly where you stopped, with no greeting and no repeating. If you stopped inside a code block, keep writing the code directly and do NOT start a new ``` block.";

const offline = [
  "My brain isn't plugged in yet, so I'm just a pile of snow right now. ❄️ (The site owner needs to add the Worker URL in config.js.)",
  "brrr… offline mode. I can only say pre-written lines like this until my brain is connected."
];

let busy = false, ctl = null, liveEl = null, liveMsg = null, rafPending = false;
function scheduleRender(){
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false; if (!liveEl) return;
    const box = $("msgs"); const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    fillBot(liveEl, liveMsg, true);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  });
}
function setBusy(on){
  busy = on;
  const s = $("send");
  s.textContent = on ? "Stop" : "Send"; s.type = on ? "button" : "submit"; s.onclick = on ? () => ctl?.abort() : null;
  document.querySelectorAll(".cont").forEach(updateContinue);
  document.querySelectorAll('[data-act="retry"]').forEach(b => b.disabled = on);
}

async function send(text){
  text = (text ?? $("box").value).trim();
  if (!text || busy) return;
  const c = active();
  checkPremium();
  if (text.startsWith("/")){ runCommand(c, text); return; }
  if (CFG.WORKER_URL && !spend()) return toast(`You're out of messages. You get them back in ${untilReset()}.`);
  c.msgs.forEach(m => { m.paused = false; });
  c.msgs.push({role:"user", content:text});
  if (c.title === "New chat") c.title = text.length > 40 ? text.slice(0,40).trim() + "…" : text;
  $("box").value = ""; autosize();
  const reply = {role:"assistant", content:""};
  c.msgs.push(reply); save(); renderAll();
  await generate(c, reply, CFG.AUTO_CONTINUES);
}

async function continueReply(c, reply){
  if (busy) return;
  if (!spend()) return toast(`You're out of messages. You get them back in ${untilReset()}.`);
  reply.paused = false; reply.error = null;
  await generate(c, reply, CFG.AUTO_CONTINUES);
}

async function generate(c, reply, autoLeft){
  // find the element for this reply (re-render so it's live)
  renderMsgs();
  liveMsg = reply; liveEl = $("msgs").lastElementChild;
  fillBot(liveEl, reply, true); $("msgs").scrollTop = $("msgs").scrollHeight;
  setBusy(true);

  if (!CFG.WORKER_URL){
    await new Promise(r => setTimeout(r, 600));
    reply.content = offline[Math.floor(Math.random() * offline.length)];
    return done(c);
  }

  while (true){
    const before = reply.content;
    const history = c.msgs.slice(0, c.msgs.indexOf(reply)).filter(m => m.content && !m.local).slice(-24)
      .map(m => ({role:m.role, content:m.content}));
    const lastUser = history.filter(m => m.role === "user").at(-1)?.content || "";
    const codey = CODE_RE.test(lastUser) || history.slice(-4).some(m => m.role === "assistant" && m.content.includes("```"));
    const messages = [{role:"system", content:systemPrompt(codey)}, ...history];
    if (before) messages.push({role:"assistant", content:before}, {role:"user", content:CONTINUE_PROMPT});
    const insideCode = (before.match(/```/g) || []).length % 2 === 1;

    ctl = new AbortController();
    let finish = null, got = "";
    // glue a continuation onto what SNOWE already wrote
    const join = () => {
      let g = got;
      if (before && insideCode) g = g.replace(/^\s*```[\w+#.-]*\n/, ""); // he re-opened the code block: drop it
      const space = before && !insideCode && !/^\s/.test(g) && !/\s$/.test(before) ? " " : "";
      return before + space + g;
    };
    try{
      const needsWeb = /https?:\/\//.test(lastUser) || /\b(latest|news|today|tonight|yesterday|current|currently|newest|recent|update|updated|version|price|cost|who is|who's|who won|who was|when is|when does|when did|release|released|weather|score|results?|2025|2026|2027|is .+ (dead|alive|real)|search|look up|google)\b/i.test(lastUser);
      const chatty = lastUser.trim().split(/\s+/).length <= 3 && !lastUser.includes("?");
      const skipWeb = !needsWeb && (codey || chatty);
      const search = (!before && settings.search !== "off" && !skipWeb && !reply.noWeb) ? (brain().search || "normal") : "off";
      if (!before && !reply.fallbackModel){ reply.steps = []; reply.reasoning = ""; reply.sources = null; }
      finish = await stream(messages, ctl.signal, search, reply.fallbackModel, st => {
        reply.steps = reply.steps || [];
        if (st.status === "searching"){
          reply.searching = st.depth || "normal";
          reply.steps.push({i:"🧠", t: st.depth === "deep" ? "Started deep research" : st.depth === "quick" ? "Started a quick web check" : "Started web research", minor:true});
        } else if (st.status === "step"){
          reply.steps.push({i: st.icon || "•", t: String(st.text || ""), d: st.detail ? String(st.detail) : undefined});
        } else {
          reply.searching = null;
          const src = (st.sources || []).filter(u => !/exa\.ai\/search|google\.com\/search|bing\.com\/search/.test(u));
          if (src.length) reply.sources = src;
          if (st.status === "searched") reply.steps.push({i:"📚", t:`Found ${src.length} source${src.length === 1 ? "" : "s"}`});
          else if (st.error) reply.steps.push({i:"⚠️", t:"Web search didn't work this time (" + st.error + ")"});
          else reply.steps.push({i:"✅", t:"No web search needed", minor:true});
        }
        scheduleRender();
      }, delta => {
        got += delta;
        if (before && got.length < 40 && !got.includes("\n")) return; // wait to see how the continuation starts
        reply.content = join();
        scheduleRender();
      }, d => { reply.thinking = true; if (d && (reply.reasoning || "").length < 20000) reply.reasoning = (reply.reasoning || "") + d; scheduleRender(); });
      if (got) reply.content = join();
    }catch(e){
      if (got) reply.content = join();
      if (e?.name === "AbortError"){
        reply.error = "Stopped.";
        if (reply.content) reply.paused = true;
      } else if (!got && !before && !reply.fallbackModel && /out of breath|speed limit|rate limit/i.test(e?.message || "")
                 && CFG.BRAINS[CFG.DEFAULT_BRAIN].model !== brain().model){
        // This brain hit Groq's limit: let Snowman answer instead (no web search, it was probably the cause)
        const helper = CFG.BRAINS[CFG.DEFAULT_BRAIN];
        reply.fallbackModel = helper.model; reply.noWeb = true;
        reply.steps = (reply.steps || []).concat({i:"⚠️", t:`${brain().name} is out of breath (Groq's free limit), so ${helper.name} is answering instead`});
        reply.searching = null; scheduleRender();
        continue;
      } else {
        if (!got) refund();
        const msg = String(e?.message || "").replace(/(\d+)\.\d+s/g, "$1s").replace(/\.\.$/, ".");
        reply.error = msg && !(e instanceof TypeError) ? (/out of breath/i.test(msg) ? msg : `SNOWE's brain said: ${msg}`) : "Can't reach SNOWE's brain. Check your internet and try again.";
        if (reply.content) reply.paused = true;
      }
      return done(c);
    }
    reply.thinking = false;

    if (finish === "length"){
      if (autoLeft > 0 && spend()){ autoLeft--; continue; }
      reply.paused = true;
    }
    return done(c);
  }
}

function done(c){
  setBusy(false); ctl = null;
  const r = liveMsg; liveEl = null; liveMsg = null;
  if (r){
    r.thinking = false; r.searching = null; delete r.fallbackModel; delete r.noWeb;
    if (r.reasoning && r.reasoning.length > 4000) r.reasoning = "…" + r.reasoning.slice(-4000);
    const tags = [...r.content.matchAll(COIN_TAG)];
    if (tags.length){
      r.content = cleanText(r.content, false);
      if (!r.paused && r.coins == null){
        const n = Math.max(-CFG.COINS.MAX_LOSS, Math.min(CFG.COINS.MAX_GAIN, parseInt(tags.at(-1)[1]) || 0));
        if (n){ r.coins = n; addCoins(n); }
      }
    }
    if (!r.content && !r.error) r.error = "SNOWE didn't say anything. Try again.";
  }
  save(); if (c.id === activeId) renderMsgs(); renderList(); renderUsage();
}

// Streams one answer from the Worker. Returns the finish reason ("stop", "length", ...).
async function stream(messages, signal, search, modelOverride, onStatus, onDelta, onThinking){
  const res = await fetch(CFG.WORKER_URL, {
    method:"POST", signal,
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({model: modelOverride || brain().model, messages, search})
  });
  if (!res.ok){
    let msg = `error ${res.status}`;
    try{ msg = (await res.json()).error || msg; }catch{}
    throw new Error(msg);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", finish = null;
  while (true){
    const {value, done} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream:true});
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines){
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return finish;
      let j; try{ j = JSON.parse(data); }catch{ continue; }
      if (j.error) throw new Error(j.error.message || "stream error");
      if (j.snowe){ if (j.snowe.error && !j.snowe.status) throw new Error(j.snowe.error); onStatus(j.snowe); continue; }
      const ch = j.choices?.[0]; if (!ch) continue;
      if (ch.delta?.content) onDelta(ch.delta.content);
      else if (ch.delta?.reasoning) onThinking(ch.delta.reasoning);
      if (ch.finish_reason) finish = ch.finish_reason;
    }
  }
  return finish;
}

/* ================= commands + shop ================= */
function buyPremium(){
  checkPremium();
  if (premiumLeft()) return `You already have ${PREM.name}! It has ${fmtTime(premiumLeft())} left.`;
  if (coins < PREM.PRICE) return `${PREM.name} costs ${PREM.PRICE} ❄ and you have ${coins}. You need ${PREM.PRICE - coins} more. Try being extra nice to me. ❄️`;
  addCoins(-PREM.PRICE);
  settings.prevBrain = settings.brain; settings.brain = PREM.key;
  settings.premiumUntil = Date.now() + PREM.MINUTES * 60e3;
  store.set("settings", settings); fillBrains(); renderUsage();
  return `**${PREM.name} unlocked!** 🌨️ I'm using my biggest brain for the next ${fmtTime(PREM.MINUTES * 60e3)}. After that it melts and I go back to ${CFG.BRAINS[settings.prevBrain]?.name || "normal"}.`;
}
function runCommand(c, text){
  const [cmd, ...rest] = text.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ").toLowerCase();
  let out;
  switch ((cmd || "").toLowerCase()){
    case "help": case "commands":
      out = "**Commands** (free, they don't use messages):\n- `/coins` shows your SnowCoins\n- `/shop` opens the SnowCoin shop\n- `/buy` buys " + PREM.name + " for " + PREM.PRICE + " ❄ (" + PREM.MINUTES + " minutes)\n- `/brain` lists brains, `/brain snowball` switches\n- `/help` shows this"; break;
    case "coins": case "balance":
      out = `You have **${coins} ❄ SnowCoins**. ${PREM.name} costs ${PREM.PRICE}.` + (premiumLeft() ? ` ${PREM.name} is active with ${fmtTime(premiumLeft())} left.` : ""); break;
    case "shop": case "store":
      openShop(); out = "Opening the SnowCoin shop. 🛒"; break;
    case "buy":
      out = buyPremium(); break;
    case "brain": case "model": {
      const all = {...CFG.BRAINS, ...(premiumLeft() ? {[PREM.key]: PREM} : {})};
      const hit = Object.entries(all).find(([k, b]) => b.name.toLowerCase() === arg || k === arg);
      if (!arg) out = "Brains:\n" + Object.values(CFG.BRAINS).map(b => `- **${b.name}**: ${b.note}`).join("\n") + `\n- **${PREM.name}**: ${PREM.note} (` + (premiumLeft() ? `${fmtTime(premiumLeft())} left` : `${PREM.PRICE} ❄ in the shop`) + `)\n\nYou're using **${brain().name}**.`;
      else if (hit){ settings.brain = hit[0]; store.set("settings", settings); fillBrains(); renderUsage(); out = `Switched to **${hit[1].name}**.`; }
      else if (arg === PREM.name.toLowerCase() || arg === PREM.key) out = `${PREM.name} is locked. Buy it with \`/buy\`.`;
      else out = `I don't have a brain called "${arg}". Type \`/brain\` to see them.`;
      break; }
    default:
      out = `I don't know \`/${cmd || ""}\`. Type \`/help\` to see the commands.`;
  }
  c.msgs.forEach(m => { m.paused = false; });
  c.msgs.push({role:"user", content:text, local:true}, {role:"assistant", content:out, local:true});
  $("box").value = ""; autosize(); save(); renderMsgs(); renderList();
}
function openShop(){ checkPremium(); renderUsage(); $("shopDlg").hidden = false; }
$("coinBtn").onclick = openShop;
$("buyBtn").onclick = () => { const msg = buyPremium(); toast(msg.replace(/\*\*/g, "").split("!")[0] + "!"); renderUsage(); };

/* ================= code box buttons ================= */
const EXT = {html:"html",htm:"html",javascript:"js",js:"js",typescript:"ts",ts:"ts",python:"py",py:"py",css:"css",json:"json",java:"java",c:"c",cpp:"cpp","c++":"cpp",csharp:"cs",cs:"cs",lua:"lua",luau:"lua",bash:"sh",sh:"sh",shell:"sh",go:"go",rust:"rs",ruby:"rb",php:"php",sql:"sql",svg:"svg",xml:"xml",markdown:"md",md:"md",yaml:"yml",kotlin:"kt",swift:"swift"};

const msgOf = el => { if (el === liveEl) return liveMsg; const i = [...$("msgs").children].indexOf(el); return active().msgs[i]; };
const COOLER = "Make the code from your last answer WAY cooler: upgrade the visuals a lot (colours, gradients, glow, smooth animations, particles), make it feel more fun and polished, keep everything that already works, fix any bugs you notice, and send the FULL updated code in one block.";
$("msgs").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "activity"){
    const el = b.closest(".msg"), m = msgOf(el);
    if (m){ m.actOpen = !m.actOpen; fillBot(el, m, el === liveEl); }
    return;
  }
  if (act === "copymsg"){
    const m = msgOf(b.closest(".msg")); if (!m) return;
    try{ await navigator.clipboard.writeText(cleanText(m.content, false)); b.textContent = "Copied!"; }catch{ b.textContent = "Couldn't copy"; }
    setTimeout(() => b.textContent = "Copy", 1600); return;
  }
  if (act === "retry"){
    if (busy) return;
    const c = active(), r = c.msgs.at(-1);
    if (!r || r.role !== "assistant" || r.local) return;
    if (CFG.WORKER_URL && !spend()) return toast(`You're out of messages. You get them back in ${untilReset()}.`);
    if (r.coins) addCoins(-r.coins);
    c.msgs.pop(); const reply = {role:"assistant", content:""}; c.msgs.push(reply); save();
    await generate(c, reply, CFG.AUTO_CONTINUES); return;
  }
  if (act === "cooler"){
    if (busy) return toast("Wait for SNOWE to finish first");
    send(COOLER); return;
  }
  if (b.dataset.act === "continue"){
    const msgEls = [...$("msgs").children];
    const idx = msgEls.indexOf(b.closest(".msg"));
    const c = active(); const reply = c.msgs[idx];
    if (reply) continueReply(c, reply);
    return;
  }
  const codeEl = b.closest(".codebox").querySelector("code");
  const code = codeEl.textContent, lang = codeEl.dataset.lang;
  if (b.dataset.act === "copy"){
    try{ await navigator.clipboard.writeText(code); b.textContent = "Copied!"; }
    catch{ getSelection().selectAllChildren(codeEl); b.textContent = "Press Ctrl+C"; }
    setTimeout(() => b.textContent = "Copy", 1600);
  }
  if (b.dataset.act === "download"){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], {type:"text/plain"}));
    a.download = `snowe-code.${EXT[lang] || "txt"}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (b.dataset.act === "run") runCode(code, lang, b.closest(".msg"));
});

function runCode(code, lang, msgEl){
  // gather any CSS/JS blocks in the same answer so split-up code still works together
  const blocks = [...msgEl.querySelectorAll(".codebox code")].map(c => ({lang:c.dataset.lang, code:c.textContent}));
  const css = blocks.filter(b => b.lang === "css").map(b => b.code).join("\n");
  const js = blocks.filter(b => b.lang === "js" || b.lang === "javascript").map(b => b.code).join("\n;\n");
  let doc;
  if (lang === "html" || lang === "htm"){
    doc = code;
    if (css) doc = doc.includes("</head>") ? doc.replace("</head>", `<style>${css}</style></head>`) : `<style>${css}</style>` + doc;
    if (js) doc = doc.includes("</body>") ? doc.replace("</body>", `<script>${js}<\/script></body>`) : doc + `<script>${js}<\/script>`;
  } else if (lang === "svg"){
    doc = `<body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>`;
  } else {
    doc = `<style>body{font:14px ui-monospace,Consolas,monospace;margin:0;padding:12px;background:#0b0d10;color:#e6e8eb}.e{color:#ff6b5e}p{color:#7d838d;margin:0 0 8px}</style><p>Console output:</p><pre id="o"></pre>
<script>const o=document.getElementById("o");const w=(c,a)=>{const s=document.createElement("div");if(c)s.className=c;s.textContent=a.map(x=>typeof x==="object"?JSON.stringify(x,null,2):String(x)).join(" ");o.append(s)};
console.log=(...a)=>w("",a);console.error=(...a)=>w("e",a);window.onerror=(m)=>w("e",["Error: "+m]);<\/script><script>${code.replace(/<\/script/gi,"<\\/script")}<\/script>`;
  }
  // Catch errors inside the running code so SNOWE can fix them
  const catcher = `<script>(function(){function s(m){try{parent.postMessage({snoweErr:String(m)},"*")}catch(e){}}addEventListener("error",function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){s("Couldn't load "+(t.src||t.href));return}s((e.message||"Error")+(e.lineno?" (line "+e.lineno+")":""))},true);addEventListener("unhandledrejection",function(e){s("Promise error: "+((e.reason&&e.reason.message)||e.reason))})})();<\/script>`;
  const m = doc.match(/<head[^>]*>/i) || doc.match(/<html[^>]*>/i) || doc.match(/<!doctype[^>]*>/i);
  doc = m ? doc.slice(0, m.index + m[0].length) + catcher + doc.slice(m.index + m[0].length) : catcher + doc;
  runErrors = []; lastRunDoc = doc;
  $("runErr").hidden = true;
  $("runFrame").srcdoc = doc;
  $("runDlg").hidden = false;
}
let runErrors = [], lastRunDoc = "";
addEventListener("message", e => {
  if (e.source !== $("runFrame").contentWindow || !e.data || !e.data.snoweErr) return;
  if (runErrors.length < 5 && !runErrors.includes(e.data.snoweErr)) runErrors.push(String(e.data.snoweErr).slice(0, 300));
  $("runErrText").textContent = "⚠️ " + runErrors[0] + (runErrors.length > 1 ? ` (+${runErrors.length - 1} more)` : "");
  $("runErr").hidden = false;
});
$("fixBtn").onclick = () => {
  const errs = runErrors.join("\n"); closeDialogs();
  if (busy) return toast("Wait for SNOWE to finish first");
  send(`When I run your code I get ${runErrors.length > 1 ? "these errors" : "this error"}:\n${errs}\nPlease fix it and send the FULL fixed code.`);
};
$("newTab").onclick = () => {
  const u = URL.createObjectURL(new Blob([lastRunDoc], {type:"text/html"}));
  const a = document.createElement("a"); a.href = u; a.target = "_blank"; a.rel = "noopener"; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
};

/* ================= composer ================= */
const box = $("box");
function autosize(){ box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 180) + "px"; }
box.oninput = autosize;
box.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); send(); } };
$("form").onsubmit = e => { e.preventDefault(); if (!busy) send(); };
document.addEventListener("keydown", e => {
  const a = document.activeElement;
  if (e.key === "/" && !["TEXTAREA","INPUT","SELECT"].includes(a.tagName) && a.contentEditable !== "true"){ e.preventDefault(); box.focus(); }
  if (e.key === "Escape") closeDialogs();
});

/* ================= dialogs ================= */
function closeDialogs(){ document.querySelectorAll(".scrim").forEach(s => s.hidden = true); $("runFrame").srcdoc = ""; $("runErr").hidden = true; }
document.querySelectorAll(".scrim").forEach(s => {
  s.onclick = e => { if (e.target === s || e.target.closest("[data-close]")) closeDialogs(); };
});
$("openAbout").onclick = () => { $("aboutDlg").hidden = false; };
const brainSel = $("brain");
function fillBrains(){
  brainSel.textContent = "";
  Object.entries(CFG.BRAINS).forEach(([k, b]) => { const o = document.createElement("option"); o.value = k; o.textContent = `${b.name} — ${b.note}`; brainSel.append(o); });
  const o = document.createElement("option"); o.value = PREM.key;
  o.textContent = premiumLeft() ? `${PREM.name} — ${PREM.note} (${fmtTime(premiumLeft())} left)` : `${PREM.name} — locked, ${PREM.PRICE} ❄ in the shop`;
  o.disabled = !premiumLeft(); brainSel.append(o);
  brainSel.value = settings.brain;
}
fillBrains();
$("openSettings").onclick = () => { checkPremium(); fillBrains(); $("persona").value = settings.persona; $("websearch").value = settings.search; renderUsage(); $("settingsDlg").hidden = false; };
brainSel.onchange = e => { settings.brain = e.target.value; store.set("settings", settings); renderUsage(); };
$("persona").onchange = e => { settings.persona = e.target.value; store.set("settings", settings); };
$("websearch").onchange = e => { settings.search = e.target.value; store.set("settings", settings); };
let wipeArmed = false;
$("wipe").onclick = e => {
  if (busy) return toast("Wait for SNOWE to finish first");
  if (!wipeArmed){ wipeArmed = true; e.target.textContent = "Click again to confirm"; setTimeout(() => { wipeArmed = false; e.target.textContent = "Delete all chats"; }, 3000); return; }
  chats = [{id:uid(), title:"New chat", msgs:[]}]; activeId = chats[0].id; save(); renderAll(); closeDialogs(); toast("All chats deleted");
};
$("menu").onclick = () => $("side").classList.toggle("open");

let tt; function toast(t){ const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 2800); }

$("setup").hidden = !!CFG.WORKER_URL;
setInterval(() => { checkPremium(); renderUsage(); }, 30000);
renderAll();
})();
