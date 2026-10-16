var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../public/game/wire.js
var kinds = ["spawn", "poof", "heal", "bolt", "hit"];
var types = ["Fire", "Electric", "Nature", "Ice", "Shadow", "Earth", "Water", "Metal", "Light"];
var states = ["live", "no-baseline", "stale"];
var actions = ["idle", "move", "attack"];
var n = /* @__PURE__ */ __name((x) => Number.isFinite(x) ? Math.round(x * 100) / 100 : 0, "n");
var v = /* @__PURE__ */ __name((x) => Number.isFinite(x) ? x : 0, "v");
function packPacket(packet) {
  if (!packet.state) return packet;
  const { state: g, ...rest } = packet;
  return { ...rest, wire: 1, frame: {
    t: g.time,
    s: g.status,
    w: g.winner,
    n: g.names,
    e: g.elixir,
    l: g.levels,
    h: g.hand,
    q: g.queue,
    d: g.decks,
    c: g.score,
    i: g.nextId,
    x: g.fxSeq || 0,
    u: g.units.map((u) => [u.id, u.card, u.p, v(u.x), v(u.y), v(u.hp), u.maxHp, actions.indexOf(u.action), u.baby ? 1 : 0, v(u.slow), v(u.stun), v(u.facingX), v(u.facingY), v(u.cd), v(u.healCd), v(u.age), u.charged ? 1 : 0]),
    v: g.towers.map((t) => [t.id, t.p, t.x, t.y, v(t.hp), t.maxHp, t.king ? 1 : 0, v(t.cd), t.range]),
    f: g.effects.map((e) => [e.id, kinds.indexOf(e.kind), n(e.x), n(e.y), e.tx == null ? null : n(e.tx), e.ty == null ? null : n(e.ty), e.attacker ?? null, e.victim ?? null, e.card ?? null, e.p ?? null, e.power == null ? null : n(e.power), e.splash || 0, e.attackerAir ? 1 : 0, e.targetAir ? 1 : 0, e.color, n(e.ttl), types.indexOf(e.type)]),
    m: g.market ? [g.market.multipliers, g.market.status.map((s) => states.indexOf(s)), g.market.nextUpdate, g.market.startedAt, g.market.sequence || 0, g.market.source || null] : null
  } };
}
__name(packPacket, "packPacket");

// ../../lib/security.js
var encoder = new TextEncoder();
var b64 = /* @__PURE__ */ __name((bytes) => btoa(String.fromCharCode(...bytes)), "b64");
var unb64 = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), "unb64");
var base64url = /* @__PURE__ */ __name((b) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "base64url");
var fromBase64url = /* @__PURE__ */ __name((s) => unb64(s.replace(/-/g, "+").replace(/_/g, "/")), "fromBase64url");
async function sha256(s) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s))));
}
__name(sha256, "sha256");
async function key(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(key, "key");
async function signToken(payload, secret) {
  const data = base64url(encoder.encode(JSON.stringify(payload))), sig = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(data));
  return data + "." + base64url(new Uint8Array(sig));
}
__name(signToken, "signToken");
async function verifyToken(token, secret, { aud, now = Date.now() } = {}) {
  try {
    if (typeof token !== "string" || token.length > 4096 || !secret) return null;
    const [data, sig, ...extra] = token.split(".");
    if (extra.length || !await crypto.subtle.verify("HMAC", await key(secret), fromBase64url(sig), encoder.encode(data))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromBase64url(data)));
    return Number.isFinite(p.exp) && p.exp >= now && (!aud || p.aud === aud) ? p : null;
  } catch {
    return null;
  }
}
__name(verifyToken, "verifyToken");
async function signedHeaders(body, secret, now = Date.now()) {
  return { "Content-Type": "application/json", "x-arena-auth": await signToken({ aud: "arena-service", exp: now + 3e4, hash: await sha256(body), nonce: crypto.randomUUID() }, secret) };
}
__name(signedHeaders, "signedHeaders");
async function verifyService(request, body, secret, now = Date.now()) {
  const p = await verifyToken(request.headers.get("x-arena-auth"), secret, { aud: "arena-service", now });
  return !!(p && p.hash === await sha256(body));
}
__name(verifyService, "verifyService");
var LOOPBACK = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function sameSiteOrigin(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  if (a === b) return true;
  try {
    const x = new URL(a), y = new URL(b);
    if (x.protocol !== y.protocol || x.port !== y.port) return false;
    if (x.hostname === y.hostname) return true;
    return LOOPBACK.has(x.hostname) && LOOPBACK.has(y.hostname);
  } catch {
    return false;
  }
}
__name(sameSiteOrigin, "sameSiteOrigin");

// ../../public/game/tokens.js
var TOKENS = [
  { symbol: "BTC", name: "Bitwarden", feed: "Crypto.BTC/USD", asset: "crypto", color: "#f4ae38", baseStake: 300, identity: "A gold-armored bull. Scarcity, strength, and a coin-forged shield.", feedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
  { symbol: "SOL", name: "Solstrider", feed: "Crypto.SOL/USD", asset: "crypto", color: "#59e6c4", baseStake: 220, identity: "A neon fox with three luminous tail fins. Fast, agile electric attacks.", feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
  { symbol: "ETH", name: "Etherion", feed: "Crypto.ETH/USD", asset: "crypto", color: "#a29cff", baseStake: 320, identity: "A crystal tortoise carrying an ether-diamond shell. Resilient team defense.", feedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
  { symbol: "XRP", name: "Ripplefin", feed: "Crypto.XRP/USD", asset: "crypto", color: "#80d7f8", baseStake: 180, identity: "A blue penguin whose ripple crest sends slowing waves across the field." },
  { symbol: "BONK", name: "Bonkpack", feed: "Crypto.BONK/USD", asset: "crypto", color: "#f1ab5f", baseStake: 100, identity: "Three playful Shiba gliders. A fast, cheeky airborne ambush." },
  { symbol: "NVDA", name: "Tensorforge", feed: "Equity.US.NVDA/USD", asset: "equity", color: "#8add56", baseStake: 500, identity: "An emerald chip golem with luminous circuits. Heavy tower-breaking compute." },
  { symbol: "PEPE", name: "Pepesage", feed: "Crypto.PEPE/USD", asset: "crypto", color: "#90d77a", baseStake: 180, identity: "A friendly frog sage with a lily-pad staff. Restores nearby allies." },
  { symbol: "DOGE", name: "Dogewyrm", feed: "Crypto.DOGE/USD", asset: "crypto", color: "#ecc77a", baseStake: 420, identity: "A smiling golden Shiba dragon. Sends wide cloud-breath blasts." },
  { symbol: "WIF", name: "Hatguard", feed: "Crypto.WIF/USD", asset: "crypto", color: "#e3a2ba", baseStake: 280, identity: "A beanie-wearing Shiba bruiser. Leads with an armored charging strike." },
  { symbol: "POPCAT", name: "Popwing", feed: "Crypto.POPCAT/USD", asset: "crypto", color: "#89dddc", baseStake: 140, identity: "A wide-mouthed cat moth with patterned wings and supporting light bursts." },
  { symbol: "MEW", name: "Mewdrop", feed: "Crypto.MEW/USD", asset: "crypto", color: "#d0f0e4", baseStake: 120, identity: "A glossy cat slime with pink ears. Splits into two smaller companions." },
  { symbol: "BRETT", name: "Brettbolt", feed: "Crypto.BRETT/USD", asset: "crypto", color: "#6ba5f4", baseStake: 360, identity: "A grinning blue punk hawk with lightning feathers. A relentless aerial hunter." }
];
var MARKET_INTERVAL = 5;
var MARKET_SENSITIVITY = 200;
var MIN_DAMAGE_MULT = 0.85;
var MAX_DAMAGE_MULT = 1.15;
var quoteMaxAgeMs = /* @__PURE__ */ __name((source, asset) => asset === "equity" ? 9e5 : source === "Pyth" ? 45e3 : 18e4, "quoteMaxAgeMs");
function damageMultiplier(start, current) {
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(current) || current <= 0) return 1;
  return Math.max(MIN_DAMAGE_MULT, Math.min(MAX_DAMAGE_MULT, 1 + (current - start) / start * MARKET_SENSITIVITY));
}
__name(damageMultiplier, "damageMultiplier");
function updateMarket(g, frame, at = g.time) {
  if (!g.market) return false;
  const m = g.market;
  if (at + 1e-6 < m.nextUpdate) return false;
  const boundary = m.nextUpdate, wall = m.startedAt + boundary * 1e3;
  m.multipliers = TOKENS.map((_, i) => {
    const p = frame?.prices?.[i], base = m.baseline[i], previous = m.current?.[i];
    if (!base) {
      m.status[i] = "no-baseline";
      return 1;
    }
    if (!p || p.status !== "live" || p.publishTime * 1e3 > wall + 5e3 || wall - p.publishTime * 1e3 > quoteMaxAgeMs(m.source, TOKENS[i].asset) || p.publishTime < (previous?.publishTime || base.publishTime)) {
      m.status[i] = "stale";
      return 1;
    }
    m.status[i] = "live";
    return damageMultiplier(base.price, p.price);
  });
  m.current = TOKENS.map((_, i) => m.status[i] === "live" ? frame.prices[i] : m.current?.[i] || null);
  m.sequence++;
  m.history.push({ at: boundary, multipliers: [...m.multipliers], status: [...m.status], prices: m.current.map((p) => p ? { price: p.price, publishTime: p.publishTime, feedId: p.feedId } : null) });
  m.history = m.history.slice(-8);
  m.nextUpdate += MARKET_INTERVAL;
  return true;
}
__name(updateMarket, "updateMarket");

// ../../public/game/engine.js
var STEP = 0.1;
var ROUND = 150;
var BASE_CARDS = [
  { id: 0, name: "Emberfox", type: "Fire", role: "Splash fighter", cost: 3, hp: 540, dmg: 86, speed: 65, range: 46, rate: 0.85, splash: 48, color: "#ff985f", desc: "A quick flame-tailed fighter. Scorches nearby enemies with every attack." },
  { id: 1, name: "Voltkit", type: "Electric", role: "Ranged stunner", cost: 3, hp: 360, dmg: 72, speed: 57, range: 135, rate: 0.9, airHit: true, stun: 0.25, color: "#f9cf42", desc: "Lightning bolts briefly stun their target. Can attack flying creatures." },
  { id: 2, name: "Mossback", type: "Nature", role: "Armored tank", cost: 4, hp: 1450, dmg: 95, speed: 32, range: 45, rate: 1.25, color: "#9fce78", desc: "A sturdy garden guardian. Soaks up damage while your ranged creatures fire." },
  { id: 3, name: "Frostfin", type: "Ice", role: "Slow specialist", cost: 3, hp: 510, dmg: 60, speed: 45, range: 120, rate: 1, slow: 1.8, airHit: true, color: "#8fd3ef", desc: "Frost projectiles slow targets for 1.8 seconds. Excellent on defense." },
  { id: 4, name: "Nightwing", type: "Shadow", role: "Flying swarm", cost: 2, hp: 140, dmg: 31, speed: 86, range: 40, rate: 0.6, air: true, count: 3, airHit: true, color: "#b09de6", desc: "Deploys three quick bats. They fly over the river and overwhelm lone targets." },
  { id: 5, name: "Pebblebeast", type: "Earth", role: "Tower breaker", cost: 5, hp: 1900, dmg: 168, speed: 28, range: 45, rate: 1.35, siege: true, color: "#a9b5a7", desc: "A crystal golem that ignores creatures and heads straight for enemy towers." },
  { id: 6, name: "Bloomimp", type: "Nature", role: "Team healer", cost: 3, hp: 410, dmg: 32, speed: 41, range: 110, rate: 1.1, heal: 45, color: "#dfb5c8", desc: "Heals nearby allies while sending sprout bolts at enemies." },
  { id: 7, name: "Wavewyrm", type: "Water", role: "Flying artillery", cost: 5, hp: 890, dmg: 104, speed: 42, range: 136, rate: 1.25, splash: 56, air: true, airHit: true, color: "#83d5cc", desc: "A flying water dragon. Splash attacks punish tightly packed defenders." },
  { id: 8, name: "Ironhorn", type: "Metal", role: "Charging bruiser", cost: 4, hp: 1060, dmg: 116, speed: 55, range: 44, rate: 1.05, charge: true, color: "#bdc6d8", desc: "An armored rhinoceros. Its first attack deals double damage." },
  { id: 9, name: "Glimmer", type: "Light", role: "Flying support", cost: 2, hp: 230, dmg: 38, speed: 61, range: 118, rate: 0.75, air: true, airHit: true, heal: 18, color: "#f5e6ae", desc: "A luminous moth. Flies above the field, healing allies and firing light." },
  { id: 10, name: "Fizzblob", type: "Water", role: "Splitting slime", cost: 2, hp: 520, dmg: 49, speed: 46, range: 44, rate: 0.85, split: true, color: "#94dbcd", desc: "A bouncy slime that splits into two smaller slimes when defeated." },
  { id: 11, name: "Stormtalon", type: "Electric", role: "Aerial hunter", cost: 4, hp: 640, dmg: 90, speed: 78, range: 122, rate: 0.8, air: true, airHit: true, color: "#a3bee3", desc: "A lightning hawk with fast ranged attacks. Hunts ground and air targets." }
];
var CARDS = BASE_CARDS.map((c, i) => ({ ...c, name: TOKENS[i].name, symbol: TOKENS[i].symbol, color: TOKENS[i].color, desc: TOKENS[i].identity + " " + c.desc, type: i === 0 ? "Metal" : c.type }));
var stats = /* @__PURE__ */ __name((id, level = 1) => {
  const c = CARDS[id], m = 1 + (Math.max(1, Math.min(5, level)) - 1) * 0.1;
  return { ...c, hp: Math.round(c.hp * m), dmg: Math.round(c.dmg * m), heal: c.heal ? Math.round(c.heal * m) : 0 };
}, "stats");
function deploymentZones(g, p) {
  const own = p === 0 ? { x: 38, y: 412, w: 524, h: 222 } : { x: 38, y: 126, w: 524, h: 222 };
  const zones = [own];
  for (const tower of g.towers || []) {
    if (tower.p === p || tower.king || tower.hp > 0) continue;
    const left = tower.x < 300;
    zones.push({ x: left ? 38 : 306, y: p === 0 ? 210 : 412, w: 256, h: 138, lane: left ? "left" : "right" });
  }
  return zones;
}
__name(deploymentZones, "deploymentZones");
function canDeployAt(g, p, x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && deploymentZones(g, p).some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
__name(canDeployAt, "canDeployAt");
function deploy(g, p, slot, x, y) {
  if (g.status !== "playing") return { ok: false, error: "The battle has ended." };
  if (p !== 0 && p !== 1 || !Number.isInteger(slot) || slot < 0 || slot > 3 || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "Invalid deployment." };
  if (!canDeployAt(g, p, x, y)) return { ok: false, error: "Deploy in your blue area. Destroy a rival side tower to unlock that lane." };
  const c = stats(g.hand[p][slot], g.levels[p][g.hand[p][slot]]);
  if (g.elixir[p] + 1e-7 < c.cost) return { ok: false, error: "Need more elixir." };
  if (g.units.length > 110) return { ok: false, error: "Arena is full." };
  g.elixir[p] -= c.cost;
  for (let k = 0; k < (c.count || 1); k++) spawn(g, c, p, x + (k - ((c.count || 1) - 1) / 2) * 18, y + k * 5);
  const old = g.hand[p][slot];
  g.hand[p][slot] = g.queue[p].shift();
  g.queue[p].push(old);
  effect(g, { kind: "spawn", x, y, p, ttl: 0.65, color: c.color });
  return { ok: true };
}
__name(deploy, "deploy");
function effect(g, data) {
  g.fxSeq = (g.fxSeq || 0) + 1;
  g.effects.push({ ...data, id: g.fxSeq });
}
__name(effect, "effect");
function spawn(g, c, p, x, y, baby = false) {
  const hp = baby ? Math.round(c.hp * 0.35) : c.hp;
  g.units.push({ id: g.nextId++, card: c.id, p, x, y, hp, maxHp: hp, cd: 0.3, slow: 0, stun: 0, charged: !!c.charge, baby, healCd: 0.5, age: 0 });
}
__name(spawn, "spawn");
var dist = /* @__PURE__ */ __name((a, b) => Math.hypot(a.x - b.x, a.y - b.y), "dist");
function move(u, x, y, s) {
  const d = Math.hypot(x - u.x, y - u.y);
  if (d > 0.01) {
    u.action = "move";
    u.facingX = x - u.x;
    u.facingY = y - u.y;
    u.x += (x - u.x) / d * Math.min(s, d);
    u.y += (y - u.y) / d * Math.min(s, d);
  }
}
__name(move, "move");
function damage(g, u, target, c, mult = 1) {
  const hit = /* @__PURE__ */ __name((t) => {
    t.hp -= c.dmg * mult * (g.market?.multipliers?.[u.card] ?? 1) * (u.baby ? 0.48 : 1);
    if ("card" in t) {
      t.slow = Math.max(t.slow, c.slow || 0);
      t.stun = Math.max(t.stun, c.stun || 0);
    }
  }, "hit");
  hit(target);
  if (c.splash) {
    for (const t of g.units) if (t.p !== u.p && t.id !== target.id && t.hp > 0 && dist(t, target) < c.splash && (c.airHit || !CARDS[t.card].air)) hit(t);
  }
  effect(g, { kind: c.range > 80 ? "bolt" : "hit", attacker: u.id, victim: target.id, card: u.card, type: c.type, power: c.dmg * mult * (g.market?.multipliers?.[u.card] ?? 1) * (u.baby ? 0.48 : 1), splash: c.splash || 0, attackerAir: !!c.air, targetAir: "card" in target && !!CARDS[target.card].air, x: u.x, y: u.y, tx: target.x, ty: target.y, p: u.p, color: c.color, ttl: 0.65 });
}
__name(damage, "damage");
function step(g, dt = STEP) {
  if (g.status !== "playing") return;
  g.time += dt;
  const rate = g.time >= ROUND - 40 ? 0.85 : 0.43;
  for (let p = 0; p < 2; p++) g.elixir[p] = Math.min(10, g.elixir[p] + dt * rate);
  g.effects = g.effects.filter((e) => (e.ttl -= dt) > 0).slice(-120);
  for (const u of g.units) {
    if (u.hp <= 0) continue;
    const c = stats(u.card, g.levels[u.p][u.card]);
    u.action = "idle";
    u.age += dt;
    u.cd -= dt;
    u.healCd -= dt;
    u.slow = Math.max(0, u.slow - dt);
    u.stun = Math.max(0, u.stun - dt);
    if (c.heal && u.healCd <= 0) {
      for (const a of g.units) if (a.p === u.p && a.hp > 0 && dist(u, a) < 100) {
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + c.heal);
        if (a.hp > before) effect(g, { kind: "heal", x: a.x, y: a.y, p: u.p, color: "#80ddb3", ttl: 0.6 });
      }
      u.healCd = c.rate;
    }
    if (u.stun > 0) continue;
    let target = null, best = Infinity;
    if (!c.siege) for (const v2 of g.units) {
      if (v2.hp <= 0 || v2.p === u.p || !c.airHit && CARDS[v2.card].air) continue;
      const d = dist(u, v2);
      if (d < best && d < 170) {
        best = d;
        target = v2;
      }
    }
    if (!target) for (const t of g.towers) {
      if (t.p === u.p || t.hp <= 0) continue;
      const d = dist(u, t);
      if (d < best) {
        best = d;
        target = t;
      }
    }
    if (!target) continue;
    if (best <= c.range + ("king" in target ? 26 : 12)) {
      u.action = "attack";
      u.facingX = target.x - u.x;
      u.facingY = target.y - u.y;
      if (u.cd <= 0) {
        damage(g, u, target, c, u.charged ? 2 : 1);
        u.charged = false;
        u.cd = c.rate;
      }
    } else {
      const speed = c.speed * dt * (u.slow > 0 ? 0.55 : 1) * (u.charged ? 1.2 : 1);
      let tx = target.x, ty = target.y;
      if (!c.air && (u.y > 402 && target.y < 358 || u.y < 358 && target.y > 402 || u.y >= 358 && u.y <= 402)) {
        tx = u.x < 300 ? 135 : 465;
        ty = u.p === 0 ? 338 : 422;
      }
      move(u, tx, ty, speed);
    }
  }
  for (const t of g.towers) {
    if (t.hp <= 0) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    let target = null, near = t.range;
    for (const u of g.units) {
      if (u.p === t.p || u.hp <= 0) continue;
      const d = dist(t, u);
      if (d < near) {
        near = d;
        target = u;
      }
    }
    if (target) {
      target.hp -= t.king ? 72 : 58;
      t.cd = 0.8;
      effect(g, { kind: "bolt", attacker: t.id, victim: target.id, power: t.king ? 72 : 58, type: "Electric", targetAir: !!CARDS[target.card].air, x: t.x, y: t.y, tx: target.x, ty: target.y, color: t.p === 0 ? "#469eff" : "#f17868", ttl: 0.65 });
    }
  }
  const dead = g.units.filter((u) => u.hp <= 0);
  g.units = g.units.filter((u) => u.hp > 0);
  for (const u of dead) {
    const c = stats(u.card, g.levels[u.p][u.card]);
    effect(g, { kind: "poof", victim: u.id, x: u.x, y: u.y, p: u.p, color: c.color, ttl: 0.6 });
    if (c.split && !u.baby) {
      spawn(g, c, u.p, u.x - 13, u.y, true);
      spawn(g, c, u.p, u.x + 13, u.y, true);
    }
  }
  for (let p = 0; p < 2; p++) g.score[p] = g.towers.filter((t) => t.p !== p && t.hp <= 0).length;
  const kings = g.towers.filter((t) => t.king && t.hp <= 0);
  if (kings.length) {
    g.status = "ended";
    g.winner = kings.length === 2 ? -1 : 1 - kings[0].p;
  }
  if (g.time + 1e-8 >= ROUND && g.status === "playing") {
    g.status = "ended";
    if (g.score[0] !== g.score[1]) g.winner = g.score[0] > g.score[1] ? 0 : 1;
    else {
      const hp = [0, 0];
      for (const t of g.towers) hp[t.p] += Math.max(0, t.hp);
      g.winner = hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
    }
  }
}
__name(step, "step");

// ../../public/game/snapshots.js
function playerSnapshot(g, side) {
  const { seed, actionIds, commands, scheduled, ...safe } = g;
  return { ...safe, decks: g.decks.map((x, p) => p === side ? x : []), hand: g.hand.map((x, p) => p === side ? x : []), queue: g.queue.map((x, p) => p === side ? x : []) };
}
__name(playerSnapshot, "playerSnapshot");

// ../../lib/match-engine.js
var SCHEDULE_WINDOW = 0.5;
function runCommand(g, side, action) {
  if (!action) return { ok: true };
  if (typeof action.actionId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(action.actionId)) return { ok: false, error: "Command ID required." };
  g.commands ??= [];
  const key2 = side + ":" + action.actionId, old = g.commands.find((c) => c.id === key2);
  if (old) return old.result;
  if (g.scheduled?.some((c) => c.id === key2)) return { ok: true, scheduled: true };
  if (action.type === "deploy" && g.status === "playing" && Number.isFinite(action.at) && action.at > g.time + 1e-6 && action.at <= g.time + SCHEDULE_WINDOW) {
    g.scheduled ??= [];
    g.scheduled.push({ id: key2, side, at: action.at, action: { type: action.type, slot: action.slot, card: action.card, x: action.x, y: action.y, actionId: action.actionId } });
    return { ok: true, scheduled: true };
  }
  let result = { ok: true };
  if (g.status !== "playing") result = { ok: false, error: "The battle has ended." };
  else if (action.type === "surrender") {
    g.status = "ended";
    g.winner = 1 - side;
  } else if (action.type === "deploy") result = action.card !== void 0 && action.card !== g.hand[side][action.slot] ? { ok: false, error: "Your hand changed. Choose the card again." } : deploy(g, side, action.slot, action.x, action.y);
  else result = { ok: false, error: "Action not found." };
  g.commands.push({ id: key2, result });
  g.commands = [...g.commands.filter((c) => c.result.ok).slice(-160), ...g.commands.filter((c) => !c.result.ok).slice(-32)];
  return result;
}
__name(runCommand, "runCommand");
function runScheduled(g) {
  if (!g.scheduled?.length) return;
  const due = g.scheduled.filter((c) => c.at <= g.time + 1e-6).sort((a, b) => a.at - b.at);
  if (!due.length) return;
  g.scheduled = g.scheduled.filter((c) => !due.includes(c));
  for (const c of due) {
    const slot = g.hand[c.side].indexOf(c.action.card);
    runCommand(g, c.side, { ...c.action, slot: slot < 0 ? c.action.slot : slot });
  }
}
__name(runScheduled, "runScheduled");
function advanceMatch(g, seconds, frame) {
  if (g.status !== "playing") return 0;
  const steps = Math.max(0, Math.min(1600, Math.floor(Math.min(160, Math.max(0, seconds)) / STEP + 1e-6)));
  let advanced = 0;
  for (let i = 0; i < steps && g.status === "playing"; i++) {
    if (g.market && g.time + 1e-6 >= g.market.nextUpdate) updateMarket(g, frame, g.time);
    runScheduled(g);
    step(g);
    advanced += STEP;
  }
  if (g.status === "playing") {
    if (g.market && g.time + 1e-6 >= g.market.nextUpdate) updateMarket(g, frame, g.time);
    runScheduled(g);
  }
  return advanced;
}
__name(advanceMatch, "advanceMatch");
function processedCommands(g, side) {
  const prefix = side + ":", own = (g.commands || []).filter((c) => c.id.startsWith(prefix));
  return [...own.filter((c) => c.result.ok).slice(-16), ...own.filter((c) => !c.result.ok).slice(-8)].map((c) => c.id.slice(prefix.length));
}
__name(processedCommands, "processedCommands");
function envelope(row, g, side, result = { ok: true }, now = Date.now()) {
  return { id: row.id, side, stake: row.stake, asset: row.asset || "credits", sequence: Math.round((g.time || 0) * 1e3) * 1e3 + (row.version || 0), serverTime: now, transport: row.transport || "http", acks: processedCommands(g, side), state: playerSnapshot(g, side), ...!result.ok ? { error: result.error } : {} };
}
__name(envelope, "envelope");

// worker.js
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), "json");
async function site(env, path, data) {
  const body = JSON.stringify(data), options = { method: "POST", headers: await signedHeaders(body, env.REALTIME_SHARED_SECRET), body, signal: AbortSignal.timeout(7e3) }, response = env.SITES ? await env.SITES.fetch("https://sites.internal/api/internal/" + path, options) : await fetch(new URL("/api/internal/" + path, env.SITE_ORIGIN), options);
  if (!response.ok) throw new Error("Account service unavailable");
  return response.json();
}
__name(site, "site");
var worker_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true, protocol: 1 });
      const match = url.pathname.match(/^\/matches\/([a-zA-Z0-9-]{1,64})\/(socket|snapshot|command)$/);
      if (!match) return json({ error: "Not found." }, 404);
      if (!env.REALTIME_SHARED_SECRET || !env.SITE_ORIGIN) return json({ error: "Realtime service is not configured." }, 503);
      if (match[2] === "socket") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket upgrade required." }, 426);
        const claims = await verifyToken(url.searchParams.get("ticket"), env.REALTIME_SHARED_SECRET, { aud: "arena-room" });
        if (!claims || claims.match !== match[1] || !sameSiteOrigin(claims.origin, env.SITE_ORIGIN) || !sameSiteOrigin(request.headers.get("Origin"), env.SITE_ORIGIN)) return json({ error: "Connection ticket is invalid or expired." }, 403);
      } else {
        if (request.method !== "POST") return json({ error: "POST required." }, 405);
        const raw = await request.clone().text();
        if (raw.length > 4096 || !await verifyService(request, raw, env.REALTIME_SHARED_SECRET)) return json({ error: "Service authentication required." }, 401);
      }
      return env.MATCHES.getByName(match[1]).fetch(request);
    } catch (error) {
      console.warn("Realtime gateway error");
      return json({ error: "Match service is reconnecting." }, 503);
    }
  }
};
var MatchRoom = class {
  static {
    __name(this, "MatchRoom");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.serial = Promise.resolve();
    this.timer = null;
    this.lastSaved = 0;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get("room") || null;
      if (this.room?.g.status === "playing") this.schedule();
    });
  }
  queue(fn) {
    const next = this.serial.then(fn);
    this.serial = next.catch(() => {
    });
    return next;
  }
  async bootstrap(id) {
    if (this.room) return;
    const source = await site(this.env, "bootstrap", { id });
    if (source.row.transport !== "realtime" || !source.participants?.[0] || !source.participants?.[1]) throw new Error("Invalid room bootstrap");
    const g = typeof source.row.state === "string" ? JSON.parse(source.row.state) : source.row.state;
    if (!g?.towers || !["playing", "ended"].includes(g.status)) throw new Error("Room is not ready");
    this.room = { row: { id: source.row.id, stake: source.row.stake, asset: source.row.asset, transport: "realtime" }, participants: source.participants, g, lastTick: source.row.last_tick, sequence: source.row.version || 1, createdAt: Date.now() };
    await this.save();
    this.schedule();
  }
  async save(candidate = this.room) {
    await this.ctx.storage.put("room", candidate);
    this.lastSaved = Date.now();
    await this.ctx.storage.setAlarm(Date.now() + (candidate.g.status === "playing" ? 5e3 : 3e4));
  }
  schedule() {
    if (this.timer || this.room?.g.status !== "playing") return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.queue(async () => {
        await this.advance();
        this.broadcast();
      }).catch(() => {
        console.warn("Room tick will recover");
      }).finally(() => this.schedule());
    }, 100);
  }
  async advance() {
    if (!this.room || this.room.g.status !== "playing") return;
    const now = Date.now(), r = this.room, elapsed = Math.max(0, (now - r.lastTick) / 1e3);
    let frame = null;
    if (r.g.market && r.g.time + elapsed + 1e-6 >= r.g.market.nextUpdate) {
      try {
        frame = await site(this.env, "market", {});
      } catch {
        frame = null;
      }
    }
    const ran = advanceMatch(r.g, elapsed, frame);
    if (ran) {
      r.lastTick += ran * 1e3;
      r.sequence++;
    }
    if (r.g.status === "ended") {
      await this.ctx.storage.put({ room: r, outbox: { id: r.row.id, state: r.g, attempts: 0 } });
      await this.ctx.storage.setAlarm(now + 1e3);
      clearTimeout(this.timer);
      this.timer = null;
    } else if (now - this.lastSaved >= 1e3) await this.save();
  }
  packet(side, result = { ok: true }) {
    return envelope({ ...this.room.row, version: this.room.sequence }, this.room.g, side, result);
  }
  broadcast() {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const a = ws.deserializeAttachment();
        ws.send(JSON.stringify(packPacket({ type: "snapshot", ...this.packet(a.side) })));
      } catch {
        try {
          ws.close(1011, "Reconnect to the room");
        } catch {
        }
      }
    }
  }
  async command(side, action) {
    const prior = this.room.g.commands?.find((c) => c.id === side + ":" + action.actionId);
    if (prior) return { ...this.packet(side, prior.result), actionId: action.actionId };
    await this.advance();
    const candidate = structuredClone(this.room), result = runCommand(candidate.g, side, action);
    candidate.sequence++;
    if (candidate.g.status === "ended") {
      await this.ctx.storage.put({ room: candidate, outbox: { id: candidate.row.id, state: candidate.g, attempts: 0 } });
      await this.ctx.storage.setAlarm(Date.now() + 1e3);
    } else await this.save(candidate);
    this.room = candidate;
    this.broadcast();
    return { ...this.packet(side, result), actionId: action.actionId };
  }
  async fetch(request) {
    await this.ready;
    try {
      return await this.queue(async () => {
        const url = new URL(request.url), id = url.pathname.split("/")[2], operation = url.pathname.split("/")[3];
        await this.bootstrap(id);
        if (operation === "socket") {
          const claims = await verifyToken(url.searchParams.get("ticket"), this.env.REALTIME_SHARED_SECRET, { aud: "arena-room" });
          if (!claims || claims.match !== this.room.row.id || !sameSiteOrigin(claims.origin, this.env.SITE_ORIGIN) || !sameSiteOrigin(request.headers.get("Origin"), this.env.SITE_ORIGIN) || ![0, 1].includes(claims.side) || this.room.participants[claims.side] !== claims.player || typeof claims.jti !== "string") return json({ error: "Not a participant." }, 403);
          if (await this.ctx.storage.get("ticket:" + claims.jti)) return json({ error: "Connection ticket was already used." }, 409);
          await this.ctx.storage.put("ticket:" + claims.jti, claims.exp);
          this.room.connections ??= {};
          this.room.connections[claims.side] = claims.jti;
          await this.save();
          for (const old of this.ctx.getWebSockets("side:" + claims.side)) {
            try {
              old.close(4001, "A new connection replaced this one");
            } catch {
            }
          }
          const [client, server] = Object.values(new WebSocketPair());
          this.ctx.acceptWebSocket(server, ["side:" + claims.side]);
          server.serializeAttachment({ side: claims.side, player: claims.player, jti: claims.jti, window: Date.now(), count: 0 });
          await this.advance();
          server.send(JSON.stringify(packPacket({ type: "snapshot", ...this.packet(claims.side) })));
          this.schedule();
          return new Response(null, { status: 101, webSocket: client });
        }
        const raw = await request.text();
        if (!await verifyService(request, raw, this.env.REALTIME_SHARED_SECRET)) return json({ error: "Unauthorized." }, 401);
        const data = JSON.parse(raw), side = this.room.participants.indexOf(data.player);
        if (side < 0 || side !== data.side) return json({ error: "Not a participant." }, 403);
        if (operation === "command") return json(await this.command(side, data.action));
        await this.advance();
        return json(this.packet(side));
      });
    } catch (error) {
      console.warn("Room request failed");
      return json({ error: "The room is reconnecting. Retry the same command ID." }, 503);
    }
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 1024) {
      ws.close(1009, "Message too large");
      return;
    }
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      ws.close(1007, "Invalid JSON");
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      ws.close(1007, "Invalid command object");
      return;
    }
    const a = ws.deserializeAttachment();
    if (!a) {
      ws.close(1008, "Not a participant");
      return;
    }
    const now = Date.now();
    if (now - a.window >= 1e3) {
      a.window = now;
      a.count = 0;
    }
    a.count++;
    ws.serializeAttachment(a);
    if (a.count > 12) {
      ws.send(JSON.stringify({ type: "error", actionId: data.actionId, error: "Too many commands. Wait a moment.", retry: true }));
      return;
    }
    if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", at: Number(data.at) || 0 }));
      return;
    }
    return this.queue(async () => {
      if (this.room?.participants[a.side] !== a.player || this.room.connections?.[a.side] !== a.jti) {
        ws.close(1008, "Not a participant");
        return;
      }
      if (!["deploy", "surrender"].includes(data.type) || typeof data.actionId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(data.actionId)) {
        ws.send(JSON.stringify({ type: "error", actionId: data.actionId, error: "Invalid command." }));
        return;
      }
      try {
        const packet = await this.command(a.side, data);
        ws.send(JSON.stringify(packPacket({ type: "ack", ...packet })));
      } catch {
        ws.send(JSON.stringify({ type: "error", actionId: data.actionId, error: "The room is recovering. Your command will be retried.", retry: true }));
      }
    });
  }
  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code === 1006 ? 1011 : code, reason);
    } catch {
    }
  }
  async webSocketError(ws) {
    try {
      ws.close(1011, "Reconnect");
    } catch {
    }
  }
  async alarm() {
    await this.ready;
    return this.queue(async () => {
      await this.advance();
      this.broadcast();
      const outbox = await this.ctx.storage.get("outbox");
      if (outbox) {
        try {
          const result = await site(this.env, "settle", { id: outbox.id, state: outbox.state });
          if (result.recorded && result.settled) await this.ctx.storage.delete("outbox");
          else throw new Error("Settlement pending");
        } catch {
          outbox.attempts++;
          await this.ctx.storage.put("outbox", outbox);
          await this.ctx.storage.setAlarm(Date.now() + Math.min(6e4, 1e3 * 2 ** Math.min(outbox.attempts, 6)));
          return;
        }
      }
      const tickets = await this.ctx.storage.list({ prefix: "ticket:" }), expired = [];
      for (const [key2, expiry] of tickets) if (expiry < Date.now()) expired.push(key2);
      if (expired.length) await this.ctx.storage.delete(expired);
      if (this.room?.g.status === "playing") {
        this.schedule();
        await this.ctx.storage.setAlarm(Date.now() + 5e3);
      } else if (this.room && Date.now() - this.room.createdAt > 864e5) await this.ctx.storage.deleteAll();
      else await this.ctx.storage.setAlarm(Date.now() + 36e5);
    });
  }
};

// ../../node_modules/.pnpm/wrangler@4.92.0_@cloudflare_63341bf59f3b888ceb88c3c39f548cc1/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.92.0_@cloudflare_63341bf59f3b888ceb88c3c39f548cc1/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-nPZy3S/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../node_modules/.pnpm/wrangler@4.92.0_@cloudflare_63341bf59f3b888ceb88c3c39f548cc1/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-nPZy3S/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MatchRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
