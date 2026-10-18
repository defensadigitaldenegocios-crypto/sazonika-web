import { Hono } from "hono";
import { SQL } from "bun";

// ================== CONFIG ==================
const SITE = "https://www.sazonika.mx";
const WA_NUM = "528181139153";
const WA_TXT = "81 8113 9153";
const IG = "https://instagram.com/sazonika.mty";
const IG_TXT = "@sazonika.mty";
const ADDR = "Av. Raúl Salinas Lozano 1101, Valle Nord, Escobedo, N.L., México";
const wa = (t: string) => "https://wa.me/" + WA_NUM + "?text=" + encodeURIComponent(t);
const SHIP = 12900; // envío nacional
type Pack = { sku: string; units: number; price: number; ship: number; name: string; tag: string; env: string; hot?: boolean };
const STORE: Pack[] = [
  { sku: "pack3", units: 3, price: 8700, ship: SHIP, name: "Paquete 3 sobres", tag: "Para probar", env: "PAYMENT_LINK_PACK3" },
  { sku: "pack6", units: 6, price: 15900, ship: SHIP, name: "Paquete 6 sobres", tag: "El favorito", env: "PAYMENT_LINK_PACK6", hot: true },
  { sku: "ristra10", units: 10, price: 24900, ship: 0, name: "Ristra 10 sobres", tag: "Envío gratis", env: "PAYMENT_LINK_RISTRA10" },
];

// ================== DB ==================
const sql = Bun.env.DATABASE_URL ? new SQL(Bun.env.DATABASE_URL) : null;
let ready = false;
async function init() {
  if (!sql || ready) return;
  await sql`CREATE TABLE IF NOT EXISTS assets(name TEXT PRIMARY KEY,ctype TEXT NOT NULL,data BYTEA NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,stripe_session_id TEXT UNIQUE NOT NULL,payment_intent_id TEXT,sku TEXT NOT NULL,units INT NOT NULL,total_cents INT NOT NULL,name TEXT,email TEXT,phone TEXT,address JSONB,status TEXT NOT NULL DEFAULT 'nuevo',tracking TEXT,refunded BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS leads(id BIGSERIAL PRIMARY KEY,name TEXT,business TEXT,kind TEXT,phone TEXT,zone TEXT,status TEXT NOT NULL DEFAULT 'nuevo',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  ready = true;
}

// ================== HELPERS ==================
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (c: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format((Number(c) || 0) / 100);
const money2 = (c: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format((Number(c) || 0) / 100);
async function notify(text: string) {
  const tk = Bun.env.TELEGRAM_BOT_TOKEN, chat = Bun.env.TELEGRAM_CHAT_ID;
  if (!tk || !chat) return false;
  try { const r = await fetch("https://api.telegram.org/bot" + tk + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) }); return r.ok; } catch { return false; }
}
function auth(c: any) {
  const u = Bun.env.SAZONIKA_ADMIN_USER, p = Bun.env.SAZONIKA_ADMIN_PASS;
  if (!u || !p) return false;
  return (c.req.header("authorization") || "") === "Basic " + Buffer.from(u + ":" + p).toString("base64");
}
const needAuth = (c: any) => c.text("Autenticación requerida", 401, { "WWW-Authenticate": 'Basic realm="Sazonika"' });
async function stripeOK(raw: string, header: string, secret: string) {
  const vals = header.split(",");
  const t = vals.find(x => x.startsWith("t="))?.slice(2);
  const sigs = vals.filter(x => x.startsWith("v1=")).map(x => x.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + raw));
  const hex = [...new Uint8Array(out)].map(b => b.toString(16).padStart(2, "0")).join("");
  return sigs.includes(hex);
}
const MIME: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", ico: "image/x-icon" };
const okName = (n: string) => /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(n);
const mimeOf = (n: string) => MIME[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

// ================== STYLE ==================
const css = String.raw`
:root{--bg:#07060a;--ink:#F4EFE6;--mut:#BDB3A6;--dim:#8A8178;--red:#C8161D;--red2:#E8343B;--gold:#F2B33D;--gold2:#FFD27A;--line:rgba(242,179,61,.26);--glass:linear-gradient(135deg,rgba(38,30,28,.78),rgba(14,11,12,.62))}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:Rubik,system-ui,-apple-system,Segoe UI,Arial,sans-serif;line-height:1.5;overflow-x:hidden}
img,video{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
.os{font-family:Oswald,"Arial Narrow",Impact,sans-serif;text-transform:uppercase;letter-spacing:.01em}
.wrap{width:min(1240px,100% - 40px);margin-inline:auto}
#space{position:fixed;inset:0;z-index:-2;width:100%;height:100%}
.vign{position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,transparent 50%,rgba(0,0,0,.55) 100%)}
/* nav */
.nav{position:fixed;top:0;left:0;right:0;z-index:50;transition:background .3s,border-color .3s;border-bottom:1px solid transparent}
.nav.sc{background:rgba(9,7,8,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-color:rgba(242,179,61,.16)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:72px;gap:20px}
.nav .lg img{height:40px;width:auto}
.nav ul{display:flex;gap:28px;list-style:none;font-size:14px;letter-spacing:.14em;text-transform:uppercase;font-weight:500;color:var(--mut)}
.nav ul a:hover{color:var(--gold)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:52px;padding:0 26px;border-radius:999px;font-weight:700;font-size:15px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border:0;transition:transform .2s,box-shadow .2s,background .2s;white-space:nowrap}
.btnP{background:linear-gradient(90deg,var(--red),#E2401F);color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 10px 40px rgba(200,22,29,.45)}
.btnP:hover{transform:translateY(-2px);box-shadow:0 14px 50px rgba(232,52,59,.6)}
.btnG{background:rgba(255,255,255,.04);color:var(--ink);border:1px solid var(--line)}
.btnG:hover{border-color:var(--gold);color:var(--gold)}
.btnS{height:42px;padding:0 18px;font-size:13px}
.burger{display:none;background:none;border:0;color:var(--ink);width:44px;height:44px}
/* hud */
.hud{position:fixed;inset:0;pointer-events:none;z-index:40}
.hud i{position:absolute;width:34px;height:34px;border-color:rgba(242,179,61,.6);border-style:solid;border-width:0}
.hud i:nth-child(1){left:16px;top:84px;border-left-width:2px;border-top-width:2px}
.hud i:nth-child(2){right:16px;top:84px;border-right-width:2px;border-top-width:2px}
.hud i:nth-child(3){left:16px;bottom:16px;border-left-width:2px;border-bottom-width:2px}
.hud i:nth-child(4){right:16px;bottom:16px;border-right-width:2px;border-bottom-width:2px}
.hud .coord{position:absolute;left:62px;bottom:24px;font-size:11px;letter-spacing:.32em;color:var(--dim)}
.hud .sys{position:absolute;right:62px;bottom:24px;font-size:11px;letter-spacing:.32em;color:var(--dim);display:flex;align-items:center;gap:10px}
.hud .sys b{width:8px;height:8px;border-radius:50%;background:var(--red2);box-shadow:0 0 10px var(--red2);animation:bl 1.2s steps(2) infinite}
@keyframes bl{50%{opacity:.25}}
.prog{position:fixed;left:0;top:0;height:2px;z-index:60;background:linear-gradient(90deg,var(--red),var(--gold));width:0}
/* hero */
.hero{min-height:100vh;min-height:100svh;display:flex;align-items:center;position:relative;padding:110px 0 70px}
.hero .wrap{display:grid;grid-template-columns:1.05fr .95fr;gap:30px;align-items:center}
.eyb{font-size:13px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--gold)}
.eyb.r{color:var(--red2)}
.h1{font-family:Oswald,Impact,sans-serif;text-transform:uppercase;font-weight:700;font-size:clamp(46px,7.2vw,104px);line-height:.98;margin:18px 0 22px}
.h1 .g,.h2 .g{background:linear-gradient(90deg,var(--gold),#FF8A3D 60%,var(--red2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:clamp(17px,1.5vw,20px);color:var(--mut);max-width:560px}
.ctaRow{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:34px}
.chip{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;padding:10px 16px;border:1px solid var(--line);border-left:3px solid var(--red2);background:rgba(15,12,12,.55);border-radius:6px}
.chip:nth-child(2){border-left-color:var(--gold)}
.stage3d{position:relative;height:min(78vh,720px)}
.stage3d .tag{position:absolute;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink);background:rgba(12,10,10,.7);border:1px solid var(--line);padding:7px 12px;border-radius:6px;white-space:nowrap}
.stage3d .tag:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-right:8px;box-shadow:0 0 8px var(--gold)}
.t1{left:2%;top:22%}.t2{right:0;top:46%}.t3{left:6%;bottom:16%}
.scrollHint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);font-size:11px;letter-spacing:.3em;color:var(--dim);display:flex;flex-direction:column;align-items:center;gap:8px}
.scrollHint:after{content:"";width:1px;height:34px;background:linear-gradient(var(--gold),transparent);animation:sh 1.6s infinite}
@keyframes sh{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
/* ticker */
.tick{border-block:1px solid var(--line);background:rgba(10,8,8,.6);overflow:hidden;white-space:nowrap}
.tick div{display:inline-flex;gap:44px;padding:16px 0;animation:tk 32s linear infinite;font-family:Oswald,sans-serif;font-size:22px;letter-spacing:.08em;text-transform:uppercase}
.tick span{display:inline-flex;align-items:center;gap:44px}
.tick span:after{content:"";width:9px;height:9px;background:var(--red2);transform:rotate(45deg);box-shadow:0 0 10px var(--red2)}
@keyframes tk{to{transform:translateX(-50%)}}
/* sections */
section{position:relative;padding:120px 0}
.h2{font-family:Oswald,Impact,sans-serif;text-transform:uppercase;font-weight:700;font-size:clamp(36px,5vw,68px);line-height:1.02;margin:14px 0 18px}
.sub{color:var(--mut);font-size:18px;max-width:640px}
.glass{background:var(--glass);border:1px solid var(--line);border-radius:18px;position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03),0 24px 70px rgba(0,0,0,.5)}
.glass:before,.glass:after{content:"";position:absolute;width:18px;height:18px;border:2px solid var(--gold);pointer-events:none}
.glass:before{left:-2px;top:-2px;border-right:0;border-bottom:0;border-top-left-radius:6px}
.glass:after{right:-2px;bottom:-2px;border-left:0;border-top:0;border-bottom-right-radius:6px}
/* statement */
.stmt{padding:150px 0;text-align:center;overflow:hidden}
.stmt .bgS{position:absolute;left:50%;top:50%;width:min(520px,70vw);transform:translate(-50%,-50%) rotate(-8deg);opacity:.045}
.stmt p.k{font-size:15px;font-weight:700;letter-spacing:.3em;color:var(--mut);text-transform:uppercase}
.stmt h2{font-family:Oswald,Impact,sans-serif;font-size:clamp(56px,11vw,170px);line-height:.92;text-transform:uppercase;margin-top:14px}
.stmt h2 span{display:inline-block}
.stmt .line{height:3px;width:min(520px,70vw);margin:34px auto 0;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
/* pillars */
.two{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
.pills{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:36px}
.pill{padding:28px 24px;border-top:3px solid var(--red2)}
.pill:nth-child(2){border-top-color:var(--gold)}
.pill h3{font-family:Oswald,sans-serif;text-transform:uppercase;font-size:30px;line-height:1.1}
.pill p{color:var(--mut);font-size:15px;margin-top:10px}
.pill .n{font-family:Oswald;font-size:14px;color:var(--gold);letter-spacing:.2em}
.holo{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--line);box-shadow:0 0 70px rgba(200,22,29,.25),0 30px 80px rgba(0,0,0,.6);aspect-ratio:3/4}
.holo img{width:100%;height:100%;object-fit:cover;transform:scale(1.04)}
.holo:before{content:"";position:absolute;inset:0;z-index:1;background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 2px,transparent 2px 5px)}
.holo:after{content:"";position:absolute;left:0;right:0;height:3px;z-index:2;background:linear-gradient(90deg,transparent,#ffe2a6,transparent);box-shadow:0 0 18px 4px rgba(242,179,61,.55);animation:scan 3.4s linear infinite}
@keyframes scan{from{top:0}to{top:100%}}
.holo .lbl{position:absolute;z-index:3;left:16px;top:16px;font-size:11px;letter-spacing:.22em;background:rgba(10,8,8,.7);border:1px solid var(--line);padding:6px 12px;border-radius:6px}
/* uses */
.uses{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-top:44px}
.use{padding:26px 10px 22px;text-align:center;transition:transform .3s,border-color .3s}
.use:hover{transform:translateY(-6px);border-color:var(--gold)}
.use img{width:96px;height:96px;margin:0 auto 14px;filter:drop-shadow(0 6px 18px rgba(200,22,29,.45))}
.use b{font-family:Oswald,sans-serif;font-size:19px;letter-spacing:.06em;text-transform:uppercase;font-weight:500}
/* lab / ficha */
.lab{display:grid;grid-template-columns:.85fr 1.15fr;gap:40px;align-items:start}
.scanner{position:relative;border-radius:16px;overflow:hidden;background:#0b0909;border:1px solid var(--line)}
.scanner img{width:100%}
.scanner .beam{position:absolute;left:0;right:0;height:90px;background:linear-gradient(180deg,transparent,rgba(242,179,61,.18),transparent);border-bottom:2px solid var(--gold);box-shadow:0 8px 24px rgba(242,179,61,.4);animation:beam 4s ease-in-out infinite alternate}
@keyframes beam{from{top:-90px}to{top:100%}}
.spec{padding:30px 32px}
.spec .row{display:grid;grid-template-columns:170px 1fr;gap:18px;padding:13px 0;border-top:1px solid rgba(242,179,61,.14)}
.spec .row:first-of-type{border-top:0}
.spec dt{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;padding-top:3px}
.spec dd{color:var(--ink);font-size:16px}
.nut{margin-top:22px;width:100%;border-collapse:collapse;font-size:15px}
.nut th,.nut td{padding:9px 10px;border-bottom:1px solid rgba(244,239,230,.08);text-align:right}
.nut th:first-child,.nut td:first-child{text-align:left;color:var(--mut)}
.nut thead th{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.nut tr:last-child td{font-weight:700;color:var(--ink)}
.bar{height:6px;border-radius:6px;background:rgba(244,239,230,.1);overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--red),var(--gold));transition:width 1.6s cubic-bezier(.2,.8,.2,1)}
.in .bar i{width:var(--w)}
/* video */
.vid{padding:0;overflow:hidden;border-radius:18px}
.vid video{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
/* store */
.packs{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:46px;align-items:stretch}
.pack{padding:30px 28px 28px;display:flex;flex-direction:column;transition:transform .3s,box-shadow .3s}
.pack:hover{transform:translateY(-6px)}
.pack.hot{border-color:rgba(242,179,61,.7);box-shadow:0 0 60px rgba(242,179,61,.22),0 24px 70px rgba(0,0,0,.5)}
.pack .tg{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:6px 12px;border-radius:999px;background:rgba(200,22,29,.18);color:#FF8B8F;border:1px solid rgba(232,52,59,.4)}
.pack.hot .tg{background:var(--gold);color:#121110;border-color:var(--gold)}
.pack .vis{height:190px;display:flex;align-items:flex-end;justify-content:center;margin:20px 0 10px;position:relative}
.pack .vis img{width:98px;filter:drop-shadow(0 14px 22px rgba(0,0,0,.6));border-radius:6px}
.pack .vis img+img{margin-left:-58px}
.pack .vis .ct{position:absolute;right:6px;top:6px;font-family:Oswald;font-size:46px;line-height:1;color:var(--gold);text-shadow:0 0 20px rgba(242,179,61,.4)}
.pack h3{font-family:Oswald,sans-serif;text-transform:uppercase;font-size:28px;letter-spacing:.02em}
.pack .pr{font-family:Oswald,sans-serif;font-size:56px;line-height:1;margin-top:8px}
.pack .pr small{font-size:18px;color:var(--mut);font-family:Rubik;margin-left:6px;letter-spacing:0;text-transform:none}
.pack ul{list-style:none;margin:16px 0 22px;color:var(--mut);font-size:15px;display:grid;gap:7px}
.pack li:before{content:"\203A";color:var(--gold);font-weight:700;margin-right:10px}
.pack .btn{margin-top:auto;width:100%}
.save{color:var(--gold);font-weight:700}
.storeNote{margin-top:26px;color:var(--dim);font-size:14px;text-align:center}
/* b2b */
.b2b{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:30px}
.kpi{padding:22px 22px}
.kpi b{font-family:Oswald,sans-serif;font-size:50px;line-height:1;display:block;color:var(--ink)}
.kpi:nth-child(2) b{color:var(--gold)}
.kpi:first-child b{color:var(--red2)}
.kpi span{display:block;margin-top:6px;color:var(--mut);font-size:14px}
.flow{display:flex;align-items:stretch;gap:10px;margin-top:20px}
.flow div{flex:1;padding:16px;border-radius:12px;background:rgba(30,26,24,.7);border:1px solid var(--line);text-align:center}
.flow div:nth-child(2){background:linear-gradient(135deg,#F7C455,#E39A1F);color:#121110;border:0}
.flow small{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.8}
.flow b{font-family:Oswald;font-size:32px}
form.lead{padding:30px}
form.lead h3{font-family:Oswald;text-transform:uppercase;font-size:30px}
form.lead p{color:var(--mut);font-size:15px;margin:6px 0 18px}
.fld{display:grid;gap:6px;margin-bottom:14px}
.fld label{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700}
.fld input,.fld select{height:50px;border-radius:12px;border:1px solid rgba(242,179,61,.3);background:rgba(8,6,6,.7);color:var(--ink);padding:0 14px;font:inherit;font-size:16px;outline:none}
.fld input:focus,.fld select:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(242,179,61,.18)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.okMsg{display:none;margin-top:12px;padding:14px;border-radius:12px;background:rgba(242,179,61,.12);border:1px solid var(--gold);color:var(--ink)}
/* faq */
.faq{max-width:900px;margin:40px auto 0;display:grid;gap:12px}
.faq details{padding:0 24px;border-radius:14px}
.faq summary{list-style:none;cursor:pointer;padding:20px 0;font-weight:500;font-size:17px;display:flex;justify-content:space-between;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:"+";color:var(--gold);font-size:24px;line-height:1;transition:transform .3s}
.faq details[open] summary:after{transform:rotate(45deg)}
.faq details p{color:var(--mut);padding:0 0 20px;font-size:15px}
/* footer */
footer{border-top:1px solid var(--line);background:rgba(6,5,6,.86);padding:60px 0 40px;margin-top:60px}
footer .wrap{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:30px}
footer img{height:54px;width:auto}
footer p,footer a{color:var(--mut);font-size:14px}
footer a:hover{color:var(--gold)}
footer h4{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
footer .lst{display:grid;gap:8px}
.legal{margin-top:34px;padding-top:20px;border-top:1px solid rgba(244,239,230,.06);font-size:12px;color:var(--dim)}
.waF{position:fixed;right:20px;bottom:56px;z-index:45;width:58px;height:58px;border-radius:50%;background:#1FAF5A;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(31,175,90,.45)}
/* reveal */
.rv{opacity:0;transform:translateY(40px);transition:opacity .9s cubic-bezier(.2,.8,.2,1),transform .9s cubic-bezier(.2,.8,.2,1)}
.rv.in{opacity:1;transform:none}
.d1{transition-delay:.1s}.d2{transition-delay:.2s}.d3{transition-delay:.3s}.d4{transition-delay:.4s}.d5{transition-delay:.5s}
/* simple pages */
.doc{max-width:860px;margin:0 auto;padding:130px 20px 60px}
.doc h1{font-family:Oswald;text-transform:uppercase;font-size:44px;margin-bottom:10px}
.doc h2{font-family:Oswald;text-transform:uppercase;font-size:24px;margin:28px 0 8px;color:var(--gold)}
.doc p,.doc li{color:var(--mut);margin-bottom:10px}
.doc ul{padding-left:20px}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:100px 20px}
.card{max-width:560px;width:100%;padding:44px 36px;text-align:center}
.card .ok{width:84px;height:84px;margin:10px auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,#F7C455,#E39A1F);color:#121110;font-size:46px;font-weight:700;box-shadow:0 0 50px rgba(242,179,61,.5)}
/* admin */
.adm{max-width:1200px;margin:0 auto;padding:30px 20px}
.adm h1{font-family:Oswald;text-transform:uppercase}
.adm table{width:100%;border-collapse:collapse;font-size:14px;margin-top:14px}
.adm th,.adm td{padding:10px;border-bottom:1px solid rgba(244,239,230,.1);text-align:left;vertical-align:top}
.adm th{color:var(--gold);font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.adm input{background:#120f0f;border:1px solid var(--line);color:var(--ink);padding:8px;border-radius:8px}
.adm .st{padding:4px 10px;border-radius:999px;font-size:12px;background:rgba(242,179,61,.15);color:var(--gold)}
@media (max-width:980px){
 .nav ul{display:none}.burger{display:block}
 .nav.open ul{display:flex;flex-direction:column;position:absolute;top:72px;left:0;right:0;background:rgba(9,7,8,.96);padding:20px;gap:18px;border-bottom:1px solid var(--line)}
 .hero{padding-top:96px}
 .hero .wrap,.two,.lab,.b2b{grid-template-columns:1fr}
 .stage3d{height:56vh;order:-1;margin-top:-10px}
 .hero .copy{margin-top:-60px}
 .pills,.packs{grid-template-columns:1fr}
 .uses{grid-template-columns:repeat(3,1fr)}
 footer .wrap{grid-template-columns:1fr}
 section{padding:84px 0}
 .hud{display:none}
 .t2{right:2%}
}
@media (max-width:560px){
 .nav .navBuy{display:none}
 .spec .row{grid-template-columns:1fr;gap:4px}
 .row2{grid-template-columns:1fr}
 .flow b{font-size:24px}
 .kpi b{font-size:40px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}}
`;

// ================== LAYOUT ==================
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">';
const WA_SVG = '<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 1.7 17.6L0 24l6.6-1.7A11.8 11.8 0 0 0 24 12a11.7 11.7 0 0 0-3.5-8.5ZM12 21.7a9.7 9.7 0 0 1-5-1.4l-.3-.2-3.9 1 1-3.8-.2-.4A9.7 9.7 0 1 1 12 21.7Zm5.3-7.3c-.3-.1-1.7-.9-2-1s-.5-.1-.7.2l-.9 1.1c-.2.2-.3.2-.6.1a7.9 7.9 0 0 1-4-3.5c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3Z"/></svg>';
const IG_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>';

function head(title: string, desc: string, path = "/", noindex = false) {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">${noindex ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${SITE}${path}">`}
<meta name="theme-color" content="#07060a"><link rel="icon" href="/img/s.webp" type="image/webp">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/img/og.jpg"><meta property="og:url" content="${SITE}${path}"><meta property="og:locale" content="es_MX"><meta name="twitter:card" content="summary_large_image">
${FONTS}<style>${css}</style></head>`;
}
function nav() {
  return `<div class="prog" id="prog"></div><header class="nav" id="nav"><div class="wrap"><a class="lg" href="/" aria-label="Sazonika inicio"><img src="/img/logo.webp" alt="Sazonika, sazonadores de alto nivel" width="150" height="83"></a>
<ul><li><a href="/#producto">Producto</a></li><li><a href="/#umami">Fórmula</a></li><li><a href="/#usos">Usos</a></li><li><a href="/#tienda">Tienda</a></li><li><a href="/#comercios">Comercios</a></li></ul>
<div style="display:flex;gap:10px;align-items:center"><a class="btn btnP btnS navBuy" href="/#tienda">Comprar</a><button class="burger" id="burger" aria-label="Abrir menú"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button></div></div></header>`;
}
function foot() {
  return `<footer><div class="wrap"><div><img src="/img/logo.webp" alt="Sazonika" width="120" height="66"><p style="margin-top:14px;max-width:360px">Intensificador de sabores para carne. Fórmula Umami Blend hecha 100% en Nuevo León.</p></div>
<div><h4>Contacto</h4><div class="lst"><a href="${IG}" target="_blank" rel="noopener" style="display:inline-flex;gap:8px;align-items:center">${IG_SVG} ${IG_TXT}</a><a href="${wa("Hola Sazonika, tengo una pregunta")}" target="_blank" rel="noopener">WhatsApp ${WA_TXT}</a><p>${ADDR}</p></div></div>
<div><h4>Sitio</h4><div class="lst"><a href="/#tienda">Tienda en línea</a><a href="/#comercios">Vende Sazonika en tu negocio</a><a href="/envios">Envíos y devoluciones</a><a href="/aviso-de-privacidad">Aviso de privacidad</a></div></div></div>
<div class="wrap legal">© ${new Date().getFullYear()} Sazonika® · Sazonadores de alto nivel · Hecho en Nuevo León, México. Contiene derivados de soya. Pagos con tarjeta procesados de forma segura por Stripe.</div></footer>
<a class="waF" href="${wa("Hola Sazonika, quiero hacer un pedido")}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">${WA_SVG}</a>`;
}
const BASE_JS = String.raw`<script>(function(){
var n=document.getElementById('nav'),p=document.getElementById('prog'),b=document.getElementById('burger');
function sc(){var y=window.scrollY;if(n)n.classList.toggle('sc',y>30);if(p){var h=document.documentElement.scrollHeight-innerHeight;p.style.width=(h>0?y/h*100:0)+'%'}}
addEventListener('scroll',sc,{passive:true});sc();
if(b)b.onclick=function(){n.classList.toggle('open')};
[].forEach.call(document.querySelectorAll('.nav ul a'),function(a){a.onclick=function(){n.classList.remove('open')}});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.15});
[].forEach.call(document.querySelectorAll('.rv'),function(x){io.observe(x)});
})();</script>`;

// ================== 3D SCENE (client) ==================
const SCENE_JS = String.raw`<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js"}}</script>
<script type="module">
import * as THREE from 'three';
var cv=document.getElementById('space');
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var R;try{R=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:false,powerPreference:'high-performance'})}catch(e){cv.style.background='radial-gradient(circle at 60% 40%,#3a0d0d,#07060a 70%)';throw e}
var DPR=Math.min(devicePixelRatio||1,1.75);R.setPixelRatio(DPR);R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.1;R.outputColorSpace=THREE.SRGBColorSpace;R.autoClear=false;
var NOISE='float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}return v;}';
var bgS=new THREE.Scene(),bgC=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
var bgM=new THREE.ShaderMaterial({uniforms:{uT:{value:0},uA:{value:1.7},uS:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
fragmentShader:'uniform float uT,uA,uS;varying vec2 vUv;'+NOISE+'void main(){vec2 p=(vUv-.5)*vec2(uA,1.)*1.5;vec3 q=vec3(p+vec2(0.,uS*.25),uT*.015);float a=fbm(q*1.2),b=fbm(q*2.4+vec3(a*1.5,0.,uT*.02));vec3 c=vec3(.012,.009,.014);c+=vec3(.46,.05,.05)*pow(b,3.2)*1.7;c+=vec3(.7,.28,.07)*pow(a*b,2.8)*1.5;c+=vec3(.13,.05,.19)*smoothstep(.42,.85,fbm(q*.7+vec3(5.)))*.8;c*=1.-.55*length(vUv-.5);gl_FragColor=vec4(c,1.);}',depthWrite:false,depthTest:false});
bgS.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),bgM));
var S=new THREE.Scene(),C=new THREE.PerspectiveCamera(38,1,.01,200);C.position.set(0,0,6);
var key=new THREE.DirectionalLight(0xfff0dc,2.6);key.position.set(-2,2,3);S.add(key);
var r1=new THREE.DirectionalLight(0xff2a18,4);r1.position.set(2.6,1.2,-2.2);S.add(r1);
var r2=new THREE.DirectionalLight(0xffa040,2.6);r2.position.set(-2.6,-.4,-2);S.add(r2);
S.add(new THREE.HemisphereLight(0x5a4a40,0x080606,1.1));
var env=new THREE.Scene();env.background=new THREE.Color(0x221816);var pm=new THREE.PMREMGenerator(R);S.environment=pm.fromScene(env,.04).texture;
function dot(){var c=document.createElement('canvas');c.width=c.height=64;var g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,220,170,.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);var t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
var mobile=innerWidth<820,NST=mobile?900:2000,sp=new Float32Array(NST*3),scol=new Float32Array(NST*3),SD=[];
var pal=[[1,1,1],[1,.86,.7],[.8,.85,1],[1,.6,.45]];
for(var i=0;i<NST;i++){var rr=3+Math.pow(Math.random(),.6)*30,a=Math.random()*6.283;SD.push([Math.cos(a)*rr,Math.sin(a)*rr*.65,Math.random()*80]);var cc=pal[i%4],br=.35+Math.random()*.65;scol[i*3]=cc[0]*br;scol[i*3+1]=cc[1]*br;scol[i*3+2]=cc[2]*br}
var sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));sg.setAttribute('color',new THREE.BufferAttribute(scol,3));
var stars=new THREE.Points(sg,new THREE.PointsMaterial({size:.2,map:dot(),vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));S.add(stars);
// pouch
var PW=.8,PH=1,BUL=.075;
function face(){var g=new THREE.PlaneGeometry(PW,PH,40,50),p=g.attributes.position;for(var i=0;i<p.count;i++){var x=p.getX(i)/(PW/2),y=p.getY(i)/(PH/2);p.setZ(i,BUL*Math.pow(Math.max(0,1-Math.pow(Math.abs(x),4)),.5)*Math.pow(Math.max(0,1-Math.pow(Math.abs(y),5)),.5))}g.computeVertexNormals();return g}
var pouch=new THREE.Group();S.add(pouch);
var tl=new THREE.TextureLoader();function tx(u){var t=tl.load(u);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t}
function mat(t){return new THREE.MeshPhysicalMaterial({map:t,roughness:.34,metalness:.05,clearcoat:.9,clearcoatRoughness:.2})}
var f=new THREE.Mesh(face(),mat(tx('/img/label-front.webp')));pouch.add(f);var bk=new THREE.Mesh(face(),mat(tx('/img/label-back.webp')));bk.rotation.y=Math.PI;pouch.add(bk);
var sm=new THREE.MeshPhysicalMaterial({color:0x17130f,roughness:.3,metalness:.55,clearcoat:.6});var seal=new THREE.Mesh(new THREE.BoxGeometry(PW,.11,.012),sm);seal.position.y=PH/2+.05;pouch.add(seal);
for(var k=0;k<5;k++){var ln=new THREE.Mesh(new THREE.BoxGeometry(PW*.98,.004,.016),new THREE.MeshStandardMaterial({color:0x2a231d,metalness:.4,roughness:.5}));ln.position.y=PH/2+.015+k*.016;pouch.add(ln)}
var hole=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.02,24),new THREE.MeshBasicMaterial({color:0x050404}));hole.rotation.x=Math.PI/2;hole.position.y=PH/2+.065;pouch.add(hole);
var gl=new THREE.Sprite(new THREE.SpriteMaterial({map:dot(),color:0xff6a28,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.5}));gl.position.z=-.5;S.add(gl);
var orb=[0,1].map(function(j){var pts=[];for(var i=0;i<160;i++)pts.push(new THREE.Vector3(Math.cos(i/160*6.283),0,Math.sin(i/160*6.283)));var o=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xF2B33D,transparent:true,opacity:.45,blending:THREE.AdditiveBlending}));S.add(o);return o});
var NS=mobile?260:520,spi=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({roughness:.55,flatShading:true}),NS);S.add(spi);
var spal=[0xb3261e,0xd9481c,0x1b1512,0x2a1d17,0xefe9dd,0xe0c07a,0xc9862e,0x8a1c14],SP=[];
for(var i=0;i<NS;i++){SP.push({a:Math.random()*6.283,r:.62+Math.random()*.9,y:(Math.random()-.5)*1.5,w:(.25+Math.random()*.8),s:.005+Math.pow(Math.random(),2)*.013,t:[Math.random(),Math.random(),Math.random()],b:Math.random()*6});spi.setColorAt(i,new THREE.Color(spal[i%spal.length]))}
var dm=new THREE.Object3D(),mx=0,my=0,tmx=0,tmy=0,scY=0,W=0,H=0,stage=document.getElementById('stage3d');
addEventListener('pointermove',function(e){tmx=e.clientX/innerWidth-.5;tmy=e.clientY/innerHeight-.5},{passive:true});
function size(){W=innerWidth;H=innerHeight;R.setSize(W,H,false);C.aspect=W/H;C.updateProjectionMatrix();bgM.uniforms.uA.value=W/H}
addEventListener('resize',size);size();
var t0=performance.now(),last=0;
function anchor(){var rc=stage?stage.getBoundingClientRect():{left:W*.55,top:H*.1,width:W*.4,height:H*.8};var cx=(rc.left+rc.width/2)/W*2-1,cy=-((rc.top+rc.height/2)/H*2-1);var v=new THREE.Vector3(cx,cy,.5).unproject(C).sub(C.position).normalize();var d=(0-C.position.z)/v.z;return C.position.clone().add(v.multiplyScalar(d))}
function loop(now){requestAnimationFrame(loop);if(document.hidden)return;var t=(now-t0)/1000;if(reduce&&t-last<1/10)return;last=t;
mx+=(tmx-mx)*.05;my+=(tmy-my)*.05;scY=window.scrollY;var hp=Math.min(1,scY/(H*.9));
var A=anchor();var sc=mobile?.95:1.25;
pouch.position.set(A.x,A.y+.03*Math.sin(t*1.2)+hp*1.2,hp*-1.5);pouch.scale.setScalar(sc*(1-.25*hp));
pouch.rotation.set(.06*Math.sin(t*.7)-.05+my*.25,-.32+.18*Math.sin(t*.5)+mx*.8+hp*3.2,.05+.02*Math.sin(t*.6));
gl.position.set(pouch.position.x,pouch.position.y-.05,-.6);gl.scale.setScalar(3.4*sc*(1-.5*hp));gl.material.opacity=.45*(1-hp);
orb.forEach(function(o,j){o.position.copy(pouch.position);o.scale.setScalar((1.05+j*.38)*sc);o.rotation.set(.35+j*.25,t*.2*(j?-1:1),-.25+j*.4);o.material.opacity=.4*(1-hp)});
for(var i=0;i<NS;i++){var s=SP[i],an=s.a+t*s.w;dm.position.set(pouch.position.x+Math.cos(an)*s.r*sc*1.15,pouch.position.y+s.y*sc+.04*Math.sin(t*1.3+s.b),pouch.position.z+Math.sin(an)*s.r*sc*.9);dm.rotation.set(s.t[0]*t*3,s.t[1]*t*3,s.t[2]*t*3);dm.scale.setScalar(s.s*sc);dm.updateMatrix();spi.setMatrixAt(i,dm.matrix)}spi.instanceMatrix.needsUpdate=true;
var dz=t*1.2+scY*.012;for(var i=0;i<NST;i++){var d=SD[i];sp[i*3]=d[0];sp[i*3+1]=d[1];sp[i*3+2]=-75+((d[2]+dz)%80)}sg.attributes.position.needsUpdate=true;
C.position.x=mx*.35;C.position.y=-my*.25;C.lookAt(0,0,-2);
bgM.uniforms.uT.value=t;bgM.uniforms.uS.value=scY/H;
R.clear();R.render(bgS,bgC);R.render(S,C)}
requestAnimationFrame(loop);
</script>`;

// ================== HOME ==================
function home() {
  const packCard = (p: Pack, i: number) => {
    const per = p.price / p.units;
    const save = 2900 * p.units - p.price;
    const imgs = Array.from({ length: Math.min(p.units, 4) }, () => '<img src="/img/label-front.webp" alt="" width="98" height="147" loading="lazy">').join("");
    return `<article class="glass pack rv d${i + 1}${p.hot ? " hot" : ""}"><span class="tg">${p.tag}</span><div class="vis">${imgs}<span class="ct">×${p.units}</span></div>
<h3>${p.name}</h3><div class="pr">${money(p.price)}<small>MXN</small></div>
<ul><li>${money2(per)} por sobre${save > 0 ? ` · <span class="save">ahorras ${money(save)}</span>` : ""}</li><li>${p.ship ? "Envío a todo México: " + money(p.ship) : '<span class="save">Envío gratis a todo México</span>'}</li><li>Rinde aprox. ${p.units} kg de carne</li></ul>
<a class="btn ${p.hot ? "btnP" : "btnG"}" href="/comprar/${p.sku}" rel="nofollow">Comprar ${p.units} sobres</a></article>`;
  };
  const uses = [["res", "Res"], ["hamburguesas", "Hamburguesas"], ["parrilla", "Parrilla"], ["steaks", "Steaks"], ["pollo", "Pollo"], ["harinas", "Harinas"]]
    .map(([f, l], i) => `<div class="glass use rv d${(i % 5) + 1}"><img src="/img/ic-${f}.webp" alt="" width="96" height="96" loading="lazy"><b>${l}</b></div>`).join("");
  const faqs: [string, string][] = [
    ["¿Qué es Sazonika?", "Es un intensificador de sabores para carne. Su fórmula Umami Blend realza el sabor natural de cada corte en lugar de taparlo. Se elabora en Nuevo León."],
    ["¿Cuánto rinde un sobre?", "Un sobre de 30 g rinde aproximadamente 1 kg de carne. La porción sugerida es de 5 g, una cucharadita."],
    ["¿Cómo se usa?", "Aplícalo directamente sobre la carne, al gusto, antes de asar, parrillar, hornear o cocinar. También funciona en hamburguesas, pollo y harinas para empanizar."],
    ["¿A dónde envían?", "A todo México. El envío cuesta " + money(SHIP) + " en los paquetes de 3 y 6 sobres, y es gratis en la ristra de 10."],
    ["¿Cómo pago?", "Con tarjeta de crédito o débito en una página de pago segura de Stripe. Ahí mismo capturas tu dirección de envío."],
    ["¿Tiene alérgenos?", "Contiene derivados de soya. Revisa la declaración nutrimental completa en la sección de la ficha del producto."],
    ["Tengo una carnicería o tienda, ¿puedo venderlo?", "Sí. Trabajamos en consignación: te dejamos una ristra de 10 sobres sin costo, ganas el 20% de cada venta y cada semana liquidas solo lo vendido."],
  ];
  const faq = faqs.map(([q, a]) => `<details class="glass rv"><summary>${q}</summary><p>${a}</p></details>`).join("");
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", name: "Sazonika Original · Umami Blend", brand: { "@type": "Brand", name: "Sazonika" },
    description: "Intensificador de sabores para carne. Sobre de 30 g, rinde aprox. 1 kg. Hecho en Nuevo León.", image: SITE + "/img/label-front.webp", gtin13: "7503064203019",
    offers: STORE.map(p => ({ "@type": "Offer", name: p.name, price: (p.price / 100).toFixed(2), priceCurrency: "MXN", availability: "https://schema.org/InStock", url: SITE + "/#tienda" })),
  });
  return head("Sazonika · Intensificador de sabores para carne | Hecho en Nuevo León", "Sazonika Original Umami Blend: el intensificador de sabores que realza el sabor natural de la carne. Compra en línea con envío a todo México.") + `<body>
<canvas id="space" aria-hidden="true"></canvas><div class="vign"></div>
<div class="hud" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="coord">NUEVO LEÓN · 25.7°N 100.3°W</span><span class="sys"><b></b>SISTEMA UMAMI BLEND · ONLINE</span></div>
${nav()}
<main>
<section class="hero" id="top"><div class="wrap">
<div class="copy"><p class="eyb rv">Intensificador de sabores para carne</p>
<h1 class="h1 rv d1">Realza el sabor <span class="g">natural</span> de la carne.</h1>
<p class="lead rv d2">Sazonika Original con fórmula Umami Blend no tapa el sabor: lo intensifica. Hecho 100% en Nuevo León.</p>
<div class="ctaRow rv d3"><a class="btn btnP" href="#tienda">Comprar desde ${money(STORE[0].price)}</a><a class="btn btnG" href="#producto">Conoce la fórmula</a></div>
<div class="chips rv d4"><span class="chip">30 g · rinde ~1 kg</span><span class="chip">Base umami</span><span class="chip">Envío a todo México</span></div></div>
<div class="stage3d" id="stage3d" aria-label="Sobre de Sazonika Original en 3D"><span class="tag t1 rv d3">Umami Blend</span><span class="tag t2 rv d4">Cont. net. 30 g</span><span class="tag t3 rv d5">Hecho en N.L.</span></div>
</div><span class="scrollHint">DESLIZA</span></section>

<div class="tick" aria-hidden="true"><div>${Array(2).fill('<span>Res</span><span>Hamburguesas</span><span>Parrilla</span><span>Steaks</span><span>Pollo</span><span>Harinas</span><span>Umami Blend</span><span>Hecho en Nuevo León</span>').join("")}</div></div>

<section class="stmt" id="producto"><img class="bgS" src="/img/s.webp" alt="" loading="lazy"><div class="wrap"><p class="k rv">Sazonika no tapa el sabor de la carne</p><h2 class="rv d1"><span>Lo</span> <span class="g" style="background:linear-gradient(90deg,#F2B33D,#E8343B);-webkit-background-clip:text;background-clip:text;color:transparent">intensifica.</span></h2><div class="line rv d2"></div></div></section>

<section id="umami"><div class="wrap two">
<div><p class="eyb r rv">01 · Qué es Sazonika</p><h2 class="h2 rv d1">Más que un sazonador: un <span class="g">intensificador de sabores.</span></h2>
<p class="sub rv d2">Sazonika Original es una mezcla con fórmula <b style="color:var(--ink)">Umami Blend</b> que realza el sabor natural de los cárnicos, en lugar de taparlo.</p>
<div class="pills">
<div class="glass pill rv d2"><span class="n">01</span><h3>Realza</h3><p>Resalta el sabor propio de cada corte, del pollo, del pescado y hasta de tus harinas para empanizar.</p></div>
<div class="glass pill rv d3"><span class="n">02</span><h3>Intensifica</h3><p>Su base umami hace que cada bocado sepa más a carne.</p></div>
<div class="glass pill rv d4"><span class="n">03</span><h3>Fórmula</h3><p>Combinación de especias formulada para resaltar el sabor natural. No solo es un sazonador: es umami.</p></div>
</div></div>
<div class="holo rv d2"><span class="lbl">◉ SABOR A LA PARRILLA</span><img src="/img/grill.webp" alt="Corte de res a la parrilla con un sobre de Sazonika" loading="lazy" width="1000" height="1250"></div>
</div></section>

<section id="usos"><div class="wrap" style="text-align:center"><p class="eyb rv">02 · Usos</p><h2 class="h2 rv d1">De la parrilla a la <span class="g">cocina diaria.</span></h2><p class="sub rv d2" style="margin:0 auto">Aplícalo directamente sobre la carne antes de asar, parrillar, hornear o cocinar.</p>
<div class="uses">${uses}</div></div></section>

<section id="ficha"><div class="wrap"><p class="eyb rv">03 · Ficha del producto</p><h2 class="h2 rv d1">Sazonika Original, <span class="g">Umami Blend.</span></h2>
<div class="lab" style="margin-top:34px">
<div class="scanner rv d1"><img src="/img/label-back.webp" alt="Reverso de la etiqueta de Sazonika Original con ingredientes, modo de uso y declaración nutrimental" loading="lazy" width="1024" height="1536"><div class="beam"></div></div>
<div class="glass spec rv d2"><dl>
<div class="row"><dt>Tipo</dt><dd>Intensificador de sabores para carne</dd></div>
<div class="row"><dt>Contenido</dt><dd>30 g · 6 porciones de 5 g</dd></div>
<div class="row"><dt>Rendimiento</dt><dd>Aprox. 1 kg de carne por sobre</dd></div>
<div class="row"><dt>Ingredientes</dt><dd>Sal yodada, glutamato monosódico (MSG), ajo en polvo, cebolla en polvo, pimienta negra, paprika y otros ingredientes permitidos.</dd></div>
<div class="row"><dt>Alérgenos</dt><dd>Contiene derivados de soya</dd></div>
<div class="row"><dt>Modo de uso</dt><dd>Aplique directamente sobre la carne al gusto. Ideal para asar, parrillar, hornear o cocinar.</dd></div>
<div class="row"><dt>Conservación</dt><dd>En un lugar fresco y seco. Cierre bien después de usar.</dd></div>
<div class="row"><dt>Código</dt><dd>EAN-13 7503064203019</dd></div></dl>
<table class="nut"><thead><tr><th>Declaración nutrimental</th><th>Por porción (5 g)</th><th>Por 100 g</th></tr></thead><tbody>
<tr><td>Contenido energético</td><td>6 kcal (25 kJ)</td><td>120 kcal (500 kJ)</td></tr><tr><td>Proteínas</td><td>0 g</td><td>2 g</td></tr><tr><td>Grasas totales</td><td>0 g</td><td>1 g</td></tr><tr><td>Grasas saturadas</td><td>0 g</td><td>0 g</td></tr><tr><td>Carbohidratos disponibles</td><td>1 g</td><td>20 g</td></tr><tr><td>Azúcares</td><td>0 g</td><td>7 g</td></tr><tr><td>Fibra dietética</td><td>0 g</td><td>1 g</td></tr><tr><td>Sodio</td><td>1,720 mg</td><td>34,500 mg</td></tr></tbody></table>
</div></div></div></section>

<section id="video"><div class="wrap"><div class="glass vid rv"><video src="/media/sazonika-15s.mp4" poster="/img/poster.webp" muted loop playsinline autoplay preload="metadata" aria-label="Video de Sazonika"></video></div></div></section>

<section id="tienda"><div class="wrap" style="text-align:center"><p class="eyb rv">04 · Tienda en línea</p><h2 class="h2 rv d1">Llévalo a tu <span class="g">parrilla.</span></h2><p class="sub rv d2" style="margin:0 auto">Elige tu paquete y paga con tarjeta. Enviamos a todo México.</p>
<div class="packs" style="text-align:left">${STORE.map(packCard).join("")}</div>
<p class="storeNote rv">Pago seguro con tarjeta procesado por Stripe. Te pedimos tu dirección y teléfono al pagar para enviarte tu pedido. ¿Dudas? <a href="${wa("Hola Sazonika, tengo una duda sobre mi pedido")}" style="color:var(--gold)" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p></div></section>

<section id="comercios"><div class="wrap b2b">
<div><p class="eyb r rv">05 · Para comercios</p><h2 class="h2 rv d1">Vende Sazonika <span class="g">sin invertir un peso.</span></h2>
<p class="sub rv d2">Para carnicerías, tienditas y minisúper. Te dejamos el producto en consignación y solo pagas lo que vendes.</p>
<div class="kpis"><div class="glass kpi rv d1"><b>$0</b><span>Inversión inicial</span></div><div class="glass kpi rv d2"><b>20%</b><span>Para tu negocio</span></div><div class="glass kpi rv d3"><b>7 días</b><span>Ciclo de liquidación</span></div><div class="glass kpi rv d4"><b>10</b><span>Sobres por ristra</span></div></div>
<div class="flow rv d4"><div><small>El cliente paga</small><b>$29</b></div><div><small>Tú te quedas</small><b>$5.80</b></div><div><small>Nos liquidas</small><b>$23.20</b></div></div>
<p class="sub rv" style="margin-top:14px;font-size:15px">Lo que no se vende, no se paga. Con dos ristras a la semana tu negocio gana $464 al mes (ejemplo, no venta garantizada).</p></div>
<form class="glass lead rv d2" id="leadF"><h3>Quiero Sazonika en mi negocio</h3><p>Déjanos tus datos y te contactamos para llevarte tu primera ristra.</p>
<div class="fld"><label for="ln">Tu nombre</label><input id="ln" name="name" required maxlength="80" autocomplete="name"></div>
<div class="fld"><label for="lb">Nombre del negocio</label><input id="lb" name="business" required maxlength="100"></div>
<div class="row2"><div class="fld"><label for="lk">Tipo</label><select id="lk" name="kind"><option>Carnicería</option><option>Tienda de esquina</option><option>Minisúper</option><option>Restaurante</option><option>Otro</option></select></div>
<div class="fld"><label for="lp">WhatsApp</label><input id="lp" name="phone" required inputmode="tel" pattern="[0-9 +()-]{10,18}" maxlength="18" autocomplete="tel"></div></div>
<div class="fld"><label for="lz">Colonia y municipio</label><input id="lz" name="zone" required maxlength="100"></div>
<input type="text" name="web" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button class="btn btnP" style="width:100%" type="submit">Quiero mi primera ristra</button>
<div class="okMsg" id="okMsg" role="status"></div></form>
</div></section>

<section id="faq"><div class="wrap" style="text-align:center"><p class="eyb rv">06 · Preguntas frecuentes</p><h2 class="h2 rv d1">Todo lo que <span class="g">quieres saber.</span></h2></div><div class="wrap"><div class="faq">${faq}</div></div></section>
</main>
${foot()}
<script type="application/ld+json">${ld}</script>
${BASE_JS}${SCENE_JS}
<script>(function(){var f=document.getElementById('leadF'),m=document.getElementById('okMsg');if(!f)return;f.onsubmit=async function(e){e.preventDefault();var b=f.querySelector('button');b.disabled=true;b.textContent='Enviando…';var d=Object.fromEntries(new FormData(f));try{var r=await fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});var j=await r.json();m.style.display='block';if(j.ok){m.innerHTML='¡Listo! Te contactaremos por WhatsApp muy pronto. Si quieres adelantarte, <a style="color:#F2B33D" target="_blank" rel="noopener" href="'+j.wa+'">escríbenos aquí</a>.';f.reset()}else{m.textContent=j.error||'No se pudo enviar. Intenta de nuevo.'}}catch(x){m.style.display='block';m.textContent='No se pudo enviar. Intenta de nuevo.'}b.disabled=false;b.textContent='Quiero mi primera ristra'}})();</script>
</body></html>`;
}

function simple(title: string, desc: string, path: string, body: string, noindex = false) {
  return head(title, desc, path, noindex) + `<body><canvas id="space" aria-hidden="true" style="background:radial-gradient(circle at 60% 30%,#2a0b0b,#07060a 70%)"></canvas>${nav()}<main>${body}</main>${foot()}${BASE_JS}</body></html>`;
}

// ================== APP ==================
const app = new Hono();
app.use("*", async (c, next) => {
  const host = (c.req.header("host") || "").toLowerCase();
  if (host === "sazonika.mx") return c.redirect(SITE + new URL(c.req.url).pathname + new URL(c.req.url).search, 301);
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});
app.get("/", c => c.html(home()));
app.get("/health", c => c.json({ ok: true, db: !!sql }));
app.get("/robots.txt", c => c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /comprar/\nSitemap: ${SITE}/sitemap.xml\n`));
app.get("/sitemap.xml", c => c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/envios", "/aviso-de-privacidad"].map(p => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`, 200, { "content-type": "application/xml" }));

// buy: redirect to the Stripe Payment Link, or WhatsApp if not configured yet
app.get("/comprar/:sku", c => {
  const p = STORE.find(x => x.sku === c.req.param("sku"));
  if (!p) return c.redirect("/#tienda");
  const link = Bun.env[p.env];
  if (link && /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(link)) return c.redirect(link, 302);
  return c.redirect(wa(`Hola Sazonika, quiero comprar el ${p.name} (${money(p.price)}${p.ship ? " + envío " + money(p.ship) : ", envío gratis"}).`), 302);
});

app.get("/gracias", c => c.html(simple("Gracias por tu compra · Sazonika", "Pedido recibido", "/gracias", `<div class="center"><div class="glass card"><img src="/img/logo.webp" alt="Sazonika" width="170" height="94" style="margin:0 auto"><div class="ok">✓</div><h1 class="os" style="font-size:36px">¡Gracias por tu compra!</h1><p style="color:var(--mut);margin:12px 0 26px">Stripe te enviará la confirmación por correo. Te avisaremos cuando salga tu pedido y te compartiremos tu guía de rastreo.</p><a class="btn btnP" href="/">Volver a Sazonika</a><p style="color:var(--dim);font-size:14px;margin-top:18px">¿Ayuda con tu pedido? <a style="color:var(--gold)" href="${wa("Hola Sazonika, acabo de hacer un pedido")}">WhatsApp ${WA_TXT}</a></p></div></div>`, true)));

app.get("/envios", c => c.html(simple("Envíos y devoluciones · Sazonika", "Política de envíos, cambios y devoluciones de Sazonika.", "/envios", `<article class="doc"><p class="eyb">Políticas</p><h1>Envíos y devoluciones</h1>
<h2>Cobertura y costo</h2><p>Enviamos a todo México. El envío cuesta ${money(SHIP)} en los paquetes de 3 y 6 sobres, y es gratis en la ristra de 10 sobres.</p>
<h2>Tiempos</h2><p>Preparamos tu pedido en 1 a 2 días hábiles después de confirmar el pago. La paquetería entrega normalmente en 2 a 6 días hábiles, según tu ciudad. Te compartimos tu guía de rastreo por correo o WhatsApp.</p>
<h2>Pagos</h2><p>Los pagos con tarjeta se procesan en la página segura de Stripe. Sazonika no recibe ni guarda los datos de tu tarjeta.</p>
<h2>Producto dañado o incorrecto</h2><p>Si tu pedido llega dañado, abierto o incompleto, escríbenos dentro de los 7 días siguientes a la entrega con una foto del paquete y del producto. Te enviamos el reemplazo sin costo o te devolvemos tu dinero.</p>
<h2>Devoluciones</h2><p>Por tratarse de un alimento, no aceptamos devoluciones de sobres abiertos, salvo por defecto del producto. Los sobres cerrados y en buen estado pueden devolverse dentro de los 7 días siguientes a la entrega; el costo del envío de regreso corre por cuenta del cliente.</p>
<h2>Contacto</h2><p>WhatsApp <a style="color:var(--gold)" href="${wa("Hola Sazonika, tengo una duda sobre mi envío")}">${WA_TXT}</a> · Instagram <a style="color:var(--gold)" href="${IG}">${IG_TXT}</a></p></article>`)));

app.get("/aviso-de-privacidad", c => c.html(simple("Aviso de privacidad · Sazonika", "Aviso de privacidad de Sazonika.", "/aviso-de-privacidad", `<article class="doc"><p class="eyb">Legal</p><h1>Aviso de privacidad</h1>
<p>Sazonika, con domicilio en ${ADDR}, es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
<h2>Datos que recabamos</h2><p>Para compras en línea: nombre, correo electrónico, teléfono y dirección de envío. Para comercios interesados en la consignación: nombre, nombre y tipo de negocio, WhatsApp y zona. No recabamos datos sensibles. Los datos de tu tarjeta los procesa directamente Stripe y no llegan a Sazonika.</p>
<h2>Finalidades</h2><ul><li>Procesar, enviar y dar seguimiento a tus pedidos.</li><li>Contactarte para atender dudas, aclaraciones o devoluciones.</li><li>Contactar a los comercios interesados para ofrecerles el producto en consignación.</li></ul>
<h2>Transferencias</h2><p>Compartimos tus datos solo con los proveedores necesarios para operar: procesador de pagos (Stripe), paquetería y servicios de alojamiento. No vendemos ni rentamos tus datos.</p>
<h2>Derechos ARCO</h2><p>Puedes solicitar el acceso, rectificación, cancelación u oposición al uso de tus datos, o revocar tu consentimiento, escribiéndonos por WhatsApp al ${WA_TXT}. Responderemos en un plazo máximo de 20 días hábiles.</p>
<h2>Cambios</h2><p>Cualquier cambio a este aviso se publicará en esta página.</p><p style="margin-top:20px;color:var(--dim)">Última actualización: octubre de 2026.</p></article>`)));

// B2B lead
app.post("/api/lead", async c => {
  const b: any = await c.req.json().catch(() => ({}));
  if (b.web) return c.json({ ok: true, wa: wa("Hola Sazonika") });
  const clip = (s: any, n: number) => String(s || "").trim().slice(0, n);
  const L = { name: clip(b.name, 80), business: clip(b.business, 100), kind: clip(b.kind, 40), phone: clip(b.phone, 18).replace(/[^0-9+() -]/g, ""), zone: clip(b.zone, 100) };
  if (!L.name || !L.business || L.phone.replace(/\D/g, "").length < 10 || !L.zone) return c.json({ ok: false, error: "Revisa tus datos: nombre, negocio, WhatsApp a 10 dígitos y zona." }, 400);
  if (sql) { await init(); await sql`INSERT INTO leads(name,business,kind,phone,zone) VALUES(${L.name},${L.business},${L.kind},${L.phone},${L.zone})`; }
  notify(`🏪 Nuevo comercio interesado\n${L.business} (${L.kind})\nContacto: ${L.name}\nWhatsApp: ${L.phone}\nZona: ${L.zone}\nVer en /admin`);
  return c.json({ ok: true, wa: wa(`Hola Sazonika, soy ${L.name} de ${L.business} (${L.zone}). Quiero mi primera ristra en consignación.`) });
});

// Stripe webhook
async function storeOrder(s: any) {
  const sku = String(s.metadata?.sku || ""), it = STORE.find(x => x.sku === sku);
  if (!it || !sql) return;
  const sd = s.collected_information?.shipping_details || s.shipping_details || {}, cd = s.customer_details || {}, ad = sd.address || cd.address || {};
  const ins = await sql`INSERT INTO orders(stripe_session_id,payment_intent_id,sku,units,total_cents,name,email,phone,address) VALUES(${s.id},${s.payment_intent || null},${sku},${it.units},${Number(s.amount_total || 0)},${sd.name || cd.name || null},${cd.email || null},${cd.phone || null},${JSON.stringify(ad)}::jsonb) ON CONFLICT(stripe_session_id) DO NOTHING RETURNING id`;
  if (ins.length) notify(`🛒 Pedido en línea #${ins[0].id}\n${it.name}\nTotal: ${money(Number(s.amount_total || 0))}\nComprador: ${sd.name || cd.name || "sin nombre"}\nEnvío a: ${[ad.city, ad.state].filter(Boolean).join(", ") || "ver en /admin"}\nDetalle y guía en /admin`);
}
app.post("/api/stripe/webhook", async c => {
  if (!sql || !Bun.env.STRIPE_WEBHOOK_SECRET) return c.json({ ok: false }, 503);
  const raw = await c.req.text(), sig = c.req.header("stripe-signature") || "";
  if (!(await stripeOK(raw, sig, Bun.env.STRIPE_WEBHOOK_SECRET))) return c.json({ ok: false }, 400);
  const e = JSON.parse(raw); await init();
  if ((e.type === "checkout.session.completed" && e.data.object.payment_status !== "unpaid") || e.type === "checkout.session.async_payment_succeeded") await storeOrder(e.data.object);
  if (e.type === "charge.refunded") { const ch = e.data.object; if (ch.payment_intent) await sql`UPDATE orders SET refunded=TRUE WHERE payment_intent_id=${ch.payment_intent}`; }
  return c.json({ received: true });
});

// assets (stored in Postgres; local folder fallback for dev)
async function serveAsset(c: any, name: string) {
  if (!okName(name)) return c.notFound();
  const ct = mimeOf(name);
  let data: Uint8Array | null = null;
  const f = Bun.file((Bun.env.ASSET_DIR || import.meta.dir + "/media") + "/" + name);
  if (await f.exists()) data = new Uint8Array(await f.arrayBuffer());
  else if (sql) { await init(); const r = await sql`SELECT data FROM assets WHERE name=${name}`; if (r.length) data = r[0].data; }
  if (!data) return c.notFound();
  const total = data.byteLength, range = c.req.header("range");
  const h: Record<string, string> = { "content-type": ct, "cache-control": "public, max-age=2592000", "accept-ranges": "bytes" };
  if (range && ct.startsWith("video/")) {
    const m = /bytes=(\d*)-(\d*)/.exec(range); let s = m && m[1] ? +m[1] : 0, e = m && m[2] ? +m[2] : Math.min(total - 1, s + 2_000_000);
    if (s >= total) return c.body(null, 416, { "content-range": "bytes */" + total });
    e = Math.min(e, total - 1);
    return c.body(data.slice(s, e + 1), 206, { ...h, "content-range": `bytes ${s}-${e}/${total}`, "content-length": String(e - s + 1) });
  }
  return c.body(data, 200, { ...h, "content-length": String(total) });
}
app.get("/img/:name", c => serveAsset(c, c.req.param("name")));
app.get("/media/:name", c => serveAsset(c, c.req.param("name")));
app.put("/admin/assets/:name", async c => {
  if (!auth(c)) return needAuth(c);
  if (!sql) return c.text("DATABASE_URL no configurado", 503);
  const name = c.req.param("name"); if (!okName(name)) return c.text("Nombre no válido", 400);
  const buf = new Uint8Array(await c.req.arrayBuffer()); if (!buf.byteLength || buf.byteLength > 30_000_000) return c.text("Archivo vacío o muy grande", 400);
  await init(); await sql`INSERT INTO assets(name,ctype,data) VALUES(${name},${mimeOf(name)},${buf}) ON CONFLICT(name) DO UPDATE SET ctype=EXCLUDED.ctype,data=EXCLUDED.data,updated_at=NOW()`;
  return c.json({ ok: true, name, bytes: buf.byteLength });
});

// admin
app.get("/admin", async c => {
  if (!auth(c)) return needAuth(c);
  if (!sql) return c.text("DATABASE_URL no configurado", 503);
  await init();
  const os = await sql`SELECT * FROM orders ORDER BY id DESC LIMIT 200`;
  const ls = await sql`SELECT * FROM leads ORDER BY id DESC LIMIT 200`;
  const tot = await sql`SELECT COALESCE(SUM(total_cents),0)::int AS t, COUNT(*)::int AS n FROM orders WHERE NOT refunded`;
  const links = STORE.map(p => `${p.name}: ${Bun.env[p.env] ? "✅ conectado" : "⚠️ falta " + p.env + " (se usa WhatsApp)"}`).join("<br>");
  const orow = os.map((o: any) => { const a = o.address || {}; return `<tr><td>#${o.id}<br><small>${new Date(o.created_at).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}</small></td><td>${esc(o.sku)} · ${o.units} sobres<br>${money(o.total_cents)}${o.refunded ? " <b style='color:#E8343B'>REEMBOLSADO</b>" : ""}</td><td>${esc(o.name)}<br>${esc(o.email)}<br>${esc(o.phone)}</td><td>${esc([a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(", "))}</td><td><span class="st">${esc(o.status)}</span><br><input data-id="${o.id}" value="${esc(o.tracking || "")}" placeholder="Guía de rastreo" style="margin-top:6px;width:150px"> <button data-id="${o.id}" class="btn btnG btnS shipB">Marcar enviado</button></td></tr>`; }).join("");
  const lrow = ls.map((l: any) => `<tr><td>#${l.id}<br><small>${new Date(l.created_at).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}</small></td><td>${esc(l.business)}<br><small>${esc(l.kind)}</small></td><td>${esc(l.name)}</td><td><a style="color:#F2B33D" href="https://wa.me/52${esc(String(l.phone).replace(/\D/g, "").slice(-10))}" target="_blank">${esc(l.phone)}</a></td><td>${esc(l.zone)}</td></tr>`).join("");
  return c.html(head("Admin · Sazonika", "", "/admin", true) + `<body><main class="adm"><img src="/img/logo.webp" alt="Sazonika" style="height:56px"><h1 style="margin-top:14px">Panel de pedidos</h1>
<p style="color:var(--mut)">${tot[0].n} pedidos · ${money(tot[0].t)} vendidos en línea</p><p style="color:var(--mut);font-size:14px;margin-top:8px">${links}</p>
<h2 class="os" style="margin-top:30px">Pedidos en línea</h2><table><thead><tr><th>Pedido</th><th>Paquete</th><th>Cliente</th><th>Dirección</th><th>Estado</th></tr></thead><tbody>${orow || "<tr><td colspan=5>Sin pedidos todavía.</td></tr>"}</tbody></table>
<h2 class="os" style="margin-top:40px">Comercios interesados</h2><table><thead><tr><th>#</th><th>Negocio</th><th>Contacto</th><th>WhatsApp</th><th>Zona</th></tr></thead><tbody>${lrow || "<tr><td colspan=5>Sin registros todavía.</td></tr>"}</tbody></table></main>
<script>[].forEach.call(document.querySelectorAll('.shipB'),function(b){b.onclick=async function(){var id=b.dataset.id,t=document.querySelector('input[data-id="'+id+'"]').value;var r=await fetch('/admin/orders/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'enviado',tracking:t})});if(r.ok)location.reload()}})</script></body></html>`);
});
app.post("/admin/orders/:id", async c => {
  if (!auth(c)) return needAuth(c);
  if (!sql) return c.text("DATABASE_URL no configurado", 503);
  const b: any = await c.req.json().catch(() => ({}));
  const st = ["nuevo", "enviado", "entregado", "cancelado"].includes(b.status) ? b.status : "nuevo";
  await init(); await sql`UPDATE orders SET status=${st},tracking=${String(b.tracking || "").slice(0, 80) || null} WHERE id=${Number(c.req.param("id"))}`;
  return c.json({ ok: true });
});

app.notFound(c => c.html(simple("Página no encontrada · Sazonika", "", "/404", `<div class="center"><div class="glass card"><div class="ok" style="background:radial-gradient(circle,#E8343B,#8a1c14);color:#fff">?</div><h1 class="os" style="font-size:34px">Esta página no existe</h1><p style="color:var(--mut);margin:12px 0 24px">Pero el sabor sigue aquí.</p><a class="btn btnP" href="/">Ir al inicio</a></div></div>`, true), 404));

export default app;
