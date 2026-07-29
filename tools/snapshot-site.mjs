/**
 * Builds a fully self-contained HTML snapshot of the running site so it can be
 * published as a claude.ai artifact (strict CSP: no external requests at all).
 *
 * Fidelity over cleverness: real compiled CSS inlined, real fonts as data URIs,
 * real images as data URIs, Next's JS stripped, plus a ~40-line vanilla script
 * that reproduces the two client behaviours the page actually uses: the
 * IntersectionObserver reveals and the live console ticker.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/site-preview.html";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// --- collect stylesheets ----------------------------------------------------
// Serialize the browser's parsed CSSOM rather than re-fetching stylesheet URLs.
// Two earlier attempts failed instructively: <link> collection got a Vite dev
// JS module instead of CSS (content negotiation — the dev server returns JS for
// */* Accept headers), and <style>-tag collection got only the 4KB preflight.
// The CSSOM is, by definition, exactly the CSS that styled the rendered page,
// regardless of how the server chose to deliver it.
let css = await page.evaluate(() =>
  Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
        return `/* ${sheet.href ?? "inline style tag"}: ${sheet.cssRules.length} rules */\n${rules}`;
      } catch {
        return `/* skipped inaccessible sheet: ${sheet.href} */`;
      }
    })
    .join("\n"),
);
// cssText serializes url()s absolute; normalise to root-relative for the inliner.
css = css.split(BASE).join("");

// --- inline url(...) assets inside CSS (fonts, textures) ---------------------
const urlRefs = [...css.matchAll(/url\((['"]?)(\/[^)'"]+)\1\)/g)].map((m) => m[2]);
const mime = (p) =>
  p.endsWith(".woff2") ? "font/woff2"
  : p.endsWith(".woff") ? "font/woff"
  : p.endsWith(".svg") ? "image/svg+xml"
  : p.endsWith(".png") ? "image/png"
  : p.endsWith(".webp") ? "image/webp"
  : "application/octet-stream";
const seen = new Map();
for (const ref of new Set(urlRefs)) {
  const r = await page.request.get(BASE + ref);
  if (!r.ok()) { console.log("skip css asset", ref, r.status()); continue; }
  const buf = await r.body();
  seen.set(ref, `data:${mime(ref)};base64,${buf.toString("base64")}`);
}
for (const [ref, data] of seen) css = css.split(ref).join(data);

// --- snapshot the DOM ---------------------------------------------------------
const html = await page.evaluate(() => {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script").forEach((s) => s.remove());
  // next/image adds srcset/sizes pointing at the optimizer route — strip them,
  // the plain src gets data-URI'd below.
  clone.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  });
  return clone.innerHTML;
});

// --- inline <img> sources -----------------------------------------------------
const imgSrcs = [...html.matchAll(/src="(\/[^"]+)"/g)].map((m) => m[1]);
let outHtml = html;
for (const src of new Set(imgSrcs)) {
  const clean = src.split("?")[0];
  const r = await page.request.get(BASE + clean);
  if (!r.ok()) { console.log("skip img", clean, r.status()); continue; }
  let buf = await r.body();
  console.log("img", clean, Math.round(buf.length / 1024) + "KB");
  const data = `data:${mime(clean)};base64,${buf.toString("base64")}`;
  outHtml = outHtml.split(`src="${src}"`).join(`src="${data}"`);
}

const bodyClass = await page.evaluate(() => document.body.className);
await browser.close();

// --- assemble -----------------------------------------------------------------
// No doctype/html/head/body: the artifact host supplies the shell. The page is
// deliberately single-theme — a dark product world — so pin color-scheme rather
// than letting the viewer theme invert it.
const doc = `<title>Ping Optimizer — Live Site Preview</title>
<style>
:root { color-scheme: dark; }
${css}
/* Snapshot host adjustments: the artifact shell is not our <body>, so carry the
   body-level font variables and background onto the wrapper. */
.pb-snapshot-root {
  min-height: 100vh;
  margin: 0;
  background:
    radial-gradient(circle at 50% -20%, rgba(21, 86, 109, 0.28), transparent 34rem),
    #050b14;
  color: #f4f8ff;
  font-family: var(--font-geist-sans, Arial), Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.pb-preview-note {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 99;
  padding: 8px 14px;
  text-align: center;
  font: 500 11px/1.4 var(--font-geist-mono, monospace), monospace;
  letter-spacing: .06em;
  color: #94a4bb;
  background: rgba(5, 11, 20, .92);
  border-top: 1px solid rgba(151, 177, 209, 0.16);
}
.pb-preview-note b { color: #48f2c3; font-weight: 600; }
</style>
<div class="pb-snapshot-root ${bodyClass}">
${outHtml}
<div class="pb-preview-note">STATIC PREVIEW · branch <b>claude/pingbooster-app-design-vaqpsc</b> · nav links &amp; downloads disabled</div>
</div>
<script>
// Reproduces the page's two client behaviours (Next's bundle is stripped).

// 1. Reveal on scroll — same thresholds as app/MotionRuntime.tsx, with a
//    fail-visible timeout so nothing can stay hidden in an odd embed context.
(() => {
  const items = Array.from(document.querySelectorAll("[data-reveal]"));
  const showAll = () => items.forEach((el) => el.classList.add("is-visible"));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return showAll();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-visible");
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -45px" });
  items.forEach((el) => io.observe(el));
  setTimeout(showAll, 4000);
  const nav = document.querySelector(".site-nav");
  addEventListener("scroll", () => nav && nav.classList.toggle("is-scrolled", scrollY > 24), { passive: true });
})();

// 2. Live console ticker — direct swings, optimized holds, game rotates.
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const q = (s) => document.querySelector(s);
  const nums = document.querySelectorAll(".console-num");
  if (nums.length < 3) return;
  const [directEl, optEl, deltaEl] = nums;
  const nameEl = q(".console-game-name");
  const iconEl = q(".console-game-icon");
  const games = [
    ["VALORANT", "#ff4655", "#0f1923", "M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"],
    ["Fortnite", "#7b2ff7", "#2ec5ff", "M3 10a9 9 0 0 1 18 0M3 10c3 0 4.5 3 4.5 3M21 10c-3 0-4.5 3-4.5 3M12 10v9M7.5 13 12 19l4.5-6"],
    ["Counter-Strike 2", "#f5a623", "#1b2838", "M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"],
    ["Apex Legends", "#da292a", "#2b2b2b", "M3 10a9 9 0 0 1 18 0M3 10c3 0 4.5 3 4.5 3M21 10c-3 0-4.5 3-4.5 3M12 10v9M7.5 13 12 19l4.5-6"],
  ];
  let gi = 0;
  const wobble = (base, spread) => Math.round(base + (Math.random() - 0.35) * spread);
  setInterval(() => {
    const d = wobble(64, 46), o = wobble(37, 4);
    directEl.textContent = d;
    optEl.textContent = o;
    if (deltaEl) deltaEl.textContent = d - o > 0 ? "−" + (d - o) : "0";
  }, 900);
  setInterval(() => {
    gi = (gi + 1) % games.length;
    const [name, a, b, path] = games[gi];
    if (nameEl) { nameEl.textContent = name; nameEl.style.animation = "none"; void nameEl.offsetWidth; nameEl.style.animation = ""; }
    if (iconEl) {
      iconEl.style.setProperty("--tile-a", a);
      iconEl.style.setProperty("--tile-b", b);
      const p = iconEl.querySelector("path");
      if (p) p.setAttribute("d", path);
    }
  }, 4200);
})();
</script>
`;

fs.writeFileSync(OUT, doc);
console.log("written", OUT, Math.round(doc.length / 1024) + "KB total");
