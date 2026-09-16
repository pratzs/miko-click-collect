/**
 * Miko Click and Collect — App Store listing images.
 *
 * Same structure as the rest of the Miko family (eyebrow / two-tone headline /
 * one paragraph / confidence chips on the left, a single realistic white UI
 * card on the right, brand lockup top-left, footer bottom-left). Only the
 * palette changes: this app's colour is lime, chosen as the midpoint of the one
 * empty band in the family's measured icon hues.
 *
 * Every UI card here is a faithful recreation of what the app actually renders,
 * built from the live walkthrough on pratham-testing-store:
 *   - the checkout pickup card is the real "Ship | Pickup" tab pair, with the
 *     real "(7 km) - Free" and "Usually ready in 24 hours" lines
 *   - the order statuses are the real lifecycle: confirmed, processing,
 *     packing, ready, collected
 * Nothing here shows a number that claims a result for the merchant.
 *
 * Run: node build-banners.mjs   (writes src/*.html then renders PNGs at 2x)
 */
import { writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const SRC = new URL("./src/", import.meta.url).pathname;
const OUT = new URL("./", import.meta.url).pathname;
mkdirSync(SRC, { recursive: true });

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
:root{
 --paper:#FBFDF5;--paper2:#EEF5DF;--ink:#1A2E05;--brand:#65A30D;--deep:#3F6212;
 --lime:#A3E635;--muted:#6E7C5C;--line:#DEEAC7;--card:#fff;--ok:#16A34A;--sky:#0EA5E9}
html,body{width:1600px;height:900px}
body{font-family:'Inter',system-ui,sans-serif;color:var(--ink);
 background:
  radial-gradient(1100px 680px at 76% 26%, rgba(163,230,53,.20), transparent 62%),
  radial-gradient(900px 600px at 12% 88%, rgba(101,163,13,.10), transparent 60%),
  linear-gradient(180deg,var(--paper),var(--paper2));
 overflow:hidden;-webkit-font-smoothing:antialiased}
.wrap{position:relative;width:1600px;height:900px;padding:60px 88px;display:flex;flex-direction:column}
.spectrum{position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#A3E635,#65A30D,#16A34A,#0EA5E9,#6366F1,#A855F7,#EC4899,#F59E0B)}
.top{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.mark{width:46px;height:46px;border-radius:12px;background:linear-gradient(160deg,var(--lime),var(--deep));display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px -7px rgba(63,98,18,.55)}
.mark svg{width:27px;height:27px}
.brand{font-size:25px;font-weight:800;letter-spacing:-.2px;color:var(--deep)}
.brand span{color:var(--muted);font-size:15px;font-weight:500;letter-spacing:0}
.body{flex:1;display:flex;align-items:center;gap:52px;margin:-6px 0}
.col-l{width:600px;flex:0 0 600px}
.col-r{flex:1;display:flex;align-items:center;justify-content:center;position:relative;height:100%}
.eyebrow{display:inline-block;font-size:14.5px;font-weight:800;letter-spacing:3.4px;text-transform:uppercase;color:var(--deep);background:rgba(101,163,13,.13);padding:8px 16px;border-radius:999px;margin-bottom:24px}
h1{font-size:66px;line-height:1.05;font-weight:800;letter-spacing:-1.9px;margin-bottom:24px}
h1 .a{color:var(--brand)}
h1.sm{font-size:55px;letter-spacing:-1.4px}
.sub{font-size:23px;line-height:1.52;color:#46543A;max-width:556px;margin-bottom:34px}
.chips{display:flex;flex-wrap:wrap;gap:11px}
.chip{display:flex;align-items:center;gap:8px;font-size:15.5px;font-weight:600;color:var(--deep);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:11px 17px;box-shadow:0 5px 14px -9px rgba(26,46,5,.35)}
.chip .dot{width:16px;height:16px;border-radius:50%;background:var(--ok);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.chip .dot svg{width:10px;height:10px}
.foot{font-size:15px;color:var(--muted);font-weight:500}
.foot b{color:var(--deep)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 44px 90px -38px rgba(26,46,5,.45),0 2px 6px -2px rgba(26,46,5,.08)}
/* checkout */
.co{width:568px;padding:34px 36px}
.co .who{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--muted);margin-bottom:18px}
.co .av{width:28px;height:28px;border-radius:50%;background:rgba(101,163,13,.16);color:var(--deep);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}
.tabs{display:flex;background:#F1F5EA;border-radius:13px;padding:5px;margin-bottom:20px}
.tab{flex:1;display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 0;font-size:18px;font-weight:700;color:var(--muted);border-radius:10px}
.tab.on{background:#fff;color:var(--ink);box-shadow:0 3px 10px -4px rgba(26,46,5,.25)}
.tab svg{width:19px;height:19px}
.near{display:flex;justify-content:space-between;align-items:center;font-size:15px;color:var(--muted);margin-bottom:11px}
.near b{color:var(--brand);font-weight:700}
.loc{border:1px solid var(--line);border-radius:13px;padding:19px 20px;display:flex;gap:16px}
.loc .k{width:92px;flex:0 0 92px;font-size:15px;color:var(--muted)}
.loc .n{font-size:18px;font-weight:800}
.loc .n i{font-style:normal;color:var(--brand)}
.loc .a{font-size:15.5px;color:#4B5A3E;margin-top:3px}
.loc .r{display:flex;align-items:center;gap:7px;font-size:14.5px;color:var(--muted);margin-top:7px}
.loc .r svg{width:15px;height:15px}
.sumrow{display:flex;justify-content:space-between;font-size:15.5px;color:#4B5A3E;margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.sumrow b{font-weight:700;color:var(--ink)}
/* locations list */
.locs{width:648px;padding:30px 32px}
.lrow{display:flex;align-items:center;gap:16px;padding:17px 4px;border-top:1px solid var(--line)}
.lrow:first-of-type{border-top:none}
.lpin{width:42px;height:42px;border-radius:11px;background:rgba(101,163,13,.13);display:flex;align-items:center;justify-content:center;color:var(--deep);flex:0 0 auto}
.lpin svg{width:21px;height:21px}
.lmeta{flex:1;min-width:0}
.lmeta .t{font-size:17.5px;font-weight:700}
.lmeta .d{font-size:14.5px;color:var(--muted);margin-top:2px}
.pill{font-size:12.5px;font-weight:800;padding:6px 12px;border-radius:999px;white-space:nowrap}
.pill.on{background:rgba(22,163,74,.13);color:#15803D}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:0 4px 14px}
.hdr .h{font-size:19px;font-weight:800}
.hdr .s{font-size:14.5px;color:var(--muted)}
/* orders */
.ords{width:688px;padding:30px 32px}
.orow{display:flex;align-items:center;gap:14px;padding:16px 4px;border-top:1px solid var(--line);font-size:16px}
.orow:first-of-type{border-top:none}
.orow .no{font-weight:800;width:74px;flex:0 0 74px}
.orow .cust{flex:1;color:#4B5A3E;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.orow .loc2{width:150px;flex:0 0 150px;text-align:right;color:var(--muted);font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st{font-size:12.5px;font-weight:800;padding:6px 13px;border-radius:999px;white-space:nowrap}
.st.c{background:rgba(245,158,11,.15);color:#B45309}
.st.p{background:rgba(14,165,233,.14);color:#0369A1}
.st.k{background:rgba(99,102,241,.14);color:#4338CA}
.st.r{background:rgba(22,163,74,.14);color:#15803D}
.st.d{background:rgba(110,124,92,.16);color:#4B5A3E}
/* status stepper */
.step{width:604px;padding:36px 38px}
.step .oh{font-size:22px;font-weight:800;margin-bottom:4px}
.step .od{font-size:15px;color:var(--muted);margin-bottom:26px}
.sline{display:flex;flex-direction:column;gap:0}
.snode{display:flex;gap:18px}
.srail{display:flex;flex-direction:column;align-items:center;flex:0 0 auto}
.sdot{width:30px;height:30px;border-radius:50%;background:#EDF2E4;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;color:#fff}
.sdot.done{background:var(--ok);border-color:var(--ok)}
.sdot.now{background:var(--brand);border-color:var(--brand);box-shadow:0 0 0 6px rgba(101,163,13,.16)}
.sdot svg{width:15px;height:15px}
.sbar{width:3px;flex:1;background:var(--line);min-height:26px}
.sbar.done{background:var(--ok)}
.sbody{padding-bottom:22px}
.sbody .t{font-size:17.5px;font-weight:700;line-height:30px}
.sbody .d{font-size:14.5px;color:var(--muted)}
.sbody.pend .t{color:#9AA890}
.cta{margin-top:8px;display:inline-flex;align-items:center;gap:9px;background:var(--deep);color:#fff;font-weight:700;font-size:16px;padding:13px 22px;border-radius:11px;box-shadow:0 12px 26px -14px rgba(63,98,18,.9)}
/* email */
.mail{width:508px;padding:0;overflow:hidden}
.mbar{background:#F1F5EA;padding:14px 22px;font-size:13.5px;color:var(--muted);display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--line)}
.mbar .d3{display:flex;gap:6px}.mbar .d3 i{width:10px;height:10px;border-radius:50%;background:#D5DFC6;display:block}
.mhead{background:linear-gradient(150deg,var(--lime),var(--deep));padding:34px 32px;color:#fff}
.mhead .s{font-size:13px;letter-spacing:2.6px;font-weight:800;opacity:.92}
.mhead .t{font-size:30px;font-weight:800;margin-top:8px;letter-spacing:-.6px}
.mbody{padding:28px 32px}
.mbody p{font-size:16px;line-height:1.55;color:#46543A;margin-bottom:18px}
.mbox{border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}
.mbox .l{font-size:12px;letter-spacing:2px;font-weight:800;color:var(--muted)}
.mbox .v{font-size:17px;font-weight:700;margin-top:5px}
.mbox .v small{display:block;font-size:14.5px;font-weight:500;color:var(--muted);margin-top:3px}
.mbtn{display:block;text-align:center;background:var(--deep);color:#fff;font-weight:700;font-size:16px;padding:14px;border-radius:11px}
/* analytics */
.an{width:648px;display:flex;flex-direction:column;gap:17px}
.arow{display:flex;gap:16px}
.stat{flex:1;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 20px 44px -30px rgba(26,46,5,.4)}
.stat .l{font-size:14px;color:var(--muted)}
.stat .n{font-size:42px;font-weight:800;margin-top:6px;line-height:1;letter-spacing:-1.4px}
.stat .d{font-size:13.5px;color:var(--muted);margin-top:6px}
.bars{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 20px 44px -30px rgba(26,46,5,.4)}
.bars .h{font-size:14.5px;font-weight:800;margin-bottom:16px}
.bar{display:flex;align-items:center;gap:12px;margin-bottom:13px}
.bar:last-child{margin-bottom:0}
.bar .lab{width:150px;font-size:13.5px;color:#4B5A3E;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .track{flex:1;height:12px;border-radius:999px;background:rgba(101,163,13,.14);overflow:hidden}
.bar .fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--lime),var(--brand))}
.bar .val{width:54px;text-align:right;font-size:13.5px;font-weight:700;color:var(--deep)}
`;

const markSvg = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 14l2 2 3.5-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const check = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const pin = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.6" stroke="currentColor" stroke-width="1.7"/></svg>`;
const clock = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5.2l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const truck = `<svg viewBox="0 0 24 24" fill="none"><path d="M3 7h11v9H3zM14 10h3.5l2.5 3v3h-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="18" r="1.8" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="18" r="1.8" stroke="currentColor" stroke-width="1.8"/></svg>`;
const store = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 9h16v11H4zM3 5h18l-1 4H4L3 5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20v-5h4v5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

function chip(t) { return `<div class="chip"><span class="dot">${check}</span>${t}</div>`; }

function page(v) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
 <div class="spectrum"></div>
 <div class="top"><div class="mark">${markSvg}</div><div class="brand">Miko Click and Collect <span>&nbsp;·&nbsp; in-store pickup</span></div></div>
 <div class="body">${v}</div>
 <div class="foot">Miko Click and Collect &nbsp;·&nbsp; <b>by Tripster Developers</b></div>
</div></body></html>`;
}

/* The checkout card, recreated from the live checkout on the test store. */
function checkoutCard() {
  return `<div class="card co">
   <div class="who"><span class="av">H</span>hana@example.com</div>
   <div class="tabs">
     <div class="tab">${truck} Ship</div>
     <div class="tab on">${pin} Pickup</div>
   </div>
   <div class="near"><span>1 nearby location with your item</span><b>1010</b></div>
   <div class="loc">
     <div class="k">Location</div>
     <div>
       <div class="n">Queen Street Store <i>(2 km)</i></div>
       <div class="a">120 Albert Street, Auckland</div>
       <div class="r">${clock} Usually ready in 2 hours</div>
     </div>
   </div>
   <div class="sumrow"><span>Pickup in store</span><b>No delivery wait</b></div>
  </div>`;
}

const banners = {
  "featured": page(`
  <div class="col-l">
   <span class="eyebrow">In-store pickup</span>
   <h1>Let them<br><span class="a">collect in store.</span></h1>
   <div class="sub">Pickup shows up at checkout with your locations, opening hours and preparation time. Every collection order is then tracked in one place.</div>
   <div class="chips">${chip("Any store")}${chip("No theme editing")}${chip("Tracking built in")}</div>
  </div>
  <div class="col-r">${checkoutCard()}</div>`),

  "ss1-checkout": page(`
  <div class="col-l">
   <span class="eyebrow">At checkout</span>
   <h1>Pickup, chosen<br><span class="a">inside checkout.</span></h1>
   <div class="sub">Shoppers switch from delivery to pickup and choose the store that suits them, with the distance and preparation time you set.</div>
   <div class="chips">${chip("Nothing to install")}${chip("Your locations")}</div>
  </div>
  <div class="col-r">${checkoutCard()}</div>`),

  "ss2-locations": page(`
  <div class="col-l">
   <span class="eyebrow">Your stores</span>
   <h1 class="sm">Locations, hours,<br><span class="a">preparation time.</span></h1>
   <div class="sub">Add every store that takes collections. Opening hours, how long orders take to prepare, and the note that tells a shopper exactly where to go.</div>
   <div class="chips">${chip("Per-location hours")}${chip("Collection notes")}</div>
  </div>
  <div class="col-r"><div class="card locs">
   <div class="hdr"><div class="h">Pickup locations</div><div class="s">3 active</div></div>
   ${[["Queen Street Store", "Mon to Sat 9:00 to 17:30 · ready in 2 hours", "Live"],
     ["Ponsonby Road", "Mon to Fri 10:00 to 18:00 · ready in 4 hours", "Live"],
     ["Botany Warehouse", "Mon to Fri 8:00 to 16:00 · ready in 24 hours", "Live"]]
    .map(([t, d, p]) => `<div class="lrow"><div class="lpin">${store}</div><div class="lmeta"><div class="t">${t}</div><div class="d">${d}</div></div><div class="pill on">${p}</div></div>`).join("")}
  </div></div>`),

  "ss3-orders": page(`
  <div class="col-l">
   <span class="eyebrow">One place</span>
   <h1>All pickup orders,<br><span class="a">on one screen.</span></h1>
   <div class="sub">Collection orders arrive here the moment they are placed, with the store they belong to and where each one has got to.</div>
   <div class="chips">${chip("By store")}${chip("By status")}${chip("Nothing missed")}</div>
  </div>
  <div class="col-r"><div class="card ords">
   <div class="hdr"><div class="h">Pickup orders</div><div class="s">Today</div></div>
   ${[["#1052", "Hana Whitcombe", "Queen Street", "Ready", "r"],
     ["#1051", "Marcus Ihaka", "Ponsonby Road", "Packing", "k"],
     ["#1050", "Ellie Fraser", "Queen Street", "Processing", "p"],
     ["#1049", "Tomas Reid", "Botany Warehouse", "Confirmed", "c"],
     ["#1047", "Priya Raman", "Queen Street", "Collected", "d"]]
    .map(([n, c2, l, s, k]) => `<div class="orow"><span class="no">${n}</span><span class="cust">${c2}</span><span class="loc2">${l}</span><span class="st ${k}">${s}</span></div>`).join("")}
  </div></div>`),

  "ss4-status": page(`
  <div class="col-l">
   <span class="eyebrow">Your workflow</span>
   <h1 class="sm">Move an order<br><span class="a">along in one click.</span></h1>
   <div class="sub">Confirmed, processing, packing, ready, collected. Use all of it or switch the middle steps off to match how your team actually works.</div>
   <div class="chips">${chip("Steps you choose")}${chip("Timestamped")}</div>
  </div>
  <div class="col-r"><div class="card step">
   <div class="oh">Order #1051</div>
   <div class="od">Marcus Ihaka · Ponsonby Road</div>
   <div class="sline">
    ${[["Confirmed", "9:12 am · order placed", "done"],
      ["Processing", "9:40 am · picking started", "done"],
      ["Packing", "10:05 am · being packed", "now"],
      ["Ready to collect", "shopper emailed automatically", "pend"],
      ["Collected", "closed when handed over", "pend"]]
      .map(([t, d, st], i, arr) => `<div class="snode">
        <div class="srail">
          <div class="sdot ${st === "done" ? "done" : st === "now" ? "now" : ""}">${st === "done" ? check : ""}</div>
          ${i < arr.length - 1 ? `<div class="sbar ${st === "done" ? "done" : ""}"></div>` : ""}
        </div>
        <div class="sbody ${st === "pend" ? "pend" : ""}"><div class="t">${t}</div><div class="d">${d}</div></div>
      </div>`).join("")}
   </div>
   <div class="cta">Mark ready to collect</div>
  </div></div>`),

  "ss5-email": page(`
  <div class="col-l">
   <span class="eyebrow">Kept informed</span>
   <h1 class="sm">Ready to collect,<br><span class="a">emailed straight away.</span></h1>
   <div class="sub">Mark an order ready and the shopper is told where to go, when the store is open and what to bring. Send it from your own address, in your own colors.</div>
   <div class="chips">${chip("Your sender address")}${chip("Your logo and color")}</div>
  </div>
  <div class="col-r"><div class="card mail">
   <div class="mbar"><span class="d3"><i></i><i></i><i></i></span>Your order is ready for collection</div>
   <div class="mhead"><div class="s">ORDER #1051</div><div class="t">Ready to collect</div></div>
   <div class="mbody">
    <p>Hi Marcus, your order is packed and waiting for you at Ponsonby Road.</p>
    <div class="mbox"><div class="l">COLLECT FROM</div><div class="v">Ponsonby Road<small>128 Ponsonby Road, Auckland</small></div></div>
    <div class="mbox"><div class="l">OPEN TODAY</div><div class="v">10:00 to 18:00<small>Bring your order number to the service desk</small></div></div>
    <div class="mbtn">View your order</div>
   </div>
  </div></div>`),

  "ss6-analytics": page(`
  <div class="col-l">
   <span class="eyebrow">Know your stores</span>
   <h1>See how collection<br><span class="a">is going.</span></h1>
   <div class="sub">Which stores shoppers pick, how long orders sit before they are collected, and how much of your order volume is coming in for pickup.</div>
   <div class="chips">${chip("By location")}${chip("Time to collect")}</div>
  </div>
  <div class="col-r"><div class="an">
   <div class="arow">
    <div class="stat"><div class="l">Collected this month</div><div class="n">312</div><div class="d">across three stores</div></div>
    <div class="stat"><div class="l">Average time to collect</div><div class="n">5h 20m</div><div class="d">from ready to handed over</div></div>
   </div>
   <div class="bars"><div class="h">Pickup orders by location</div>
    ${[["Queen Street Store", 100, "168"], ["Ponsonby Road", 62, "104"], ["Botany Warehouse", 24, "40"]]
      .map(([lab, w, v]) => `<div class="bar"><div class="lab">${lab}</div><div class="track"><div class="fill" style="width:${w}%"></div></div><div class="val">${v}</div></div>`).join("")}
   </div>
  </div></div>`),
};

for (const [name, html] of Object.entries(banners)) writeFileSync(SRC + name + ".html", html);
console.log("wrote", Object.keys(banners).length, "banner HTML files");

/* Render at deviceScaleFactor 2, then downscale to exactly 1600x900. */
const { chromium } = require("playwright");
const sharp = require("sharp");
const browser = await chromium.launch();
const page2 = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
for (const name of Object.keys(banners)) {
  await page2.goto("file://" + SRC + name + ".html");
  await page2.waitForTimeout(1600);
  const buf = await page2.screenshot({ type: "png" });
  await sharp(buf).resize(1600, 900, { kernel: "lanczos3" }).png({ palette: false, compressionLevel: 9 }).toFile(OUT + name + "-1600x900.png");
  console.log("rendered", name + "-1600x900.png");
}
await browser.close();
