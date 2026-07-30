import { chromium } from "playwright";
import fs from "node:fs";

const url = process.argv[2] ?? "http://localhost:3000/";
const out = process.argv[3] ?? "/tmp/out";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1000);

fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});

// Smooth scrolling makes programmatic scroll+screenshot unreliable: the capture
// lands mid-animation at an arbitrary offset. Force instant scrolling so every
// screenshot is taken at a known, settled position.
const killSmooth = `html, * { scroll-behavior: auto !important; }`;

async function settleTo(page, y) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page
    .waitForFunction(
      (t) =>
        Math.abs(window.scrollY - t) < 2 ||
        window.scrollY >= document.body.scrollHeight - window.innerHeight - 2,
      y,
      { timeout: 4000 },
    )
    .catch(() => {});
  await page.waitForTimeout(450);
}

async function shoot(label, opts, prefix) {
  const page = await browser.newPage(opts);
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  await page.addStyleTag({ content: killSmooth }).catch(() => {});
  await page.waitForTimeout(1200);

  const h = opts.viewport.height;
  const total = await page.evaluate(() => document.body.scrollHeight);
  const rows = [];
  let i = 1;
  for (let y = 0; y < total && i <= 12; y += h) {
    await settleTo(page, y);
    await page.screenshot({ path: `${out}/${prefix}${i}.png` });
    // How much content is invisible *while on screen*? Below-fold elements at
    // opacity 0 are correct for a scroll-driven reveal; on-screen ones are not.
    const hidden = await page.evaluate(() => {
      const vh = window.innerHeight;
      const onScreen = Array.from(
        document.querySelectorAll("[data-reveal]"),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top < vh * 0.8 && r.bottom > vh * 0.2;
      });
      const invisible = onScreen.filter(
        (el) => parseFloat(getComputedStyle(el).opacity) < 0.35,
      );
      return {
        onScreen: onScreen.length,
        invisible: invisible.length,
        which: invisible.map((e) => String(e.className).split(" ")[0]),
      };
    });
    rows.push({ y, ...hidden });
    i += 1;
  }
  console.log(`\n--- ${label} ---`);
  rows.forEach((v) =>
    console.log(
      `  y=${String(v.y).padStart(5)}  onScreen=${v.onScreen}  INVISIBLE=${v.invisible} ${v.which.length ? JSON.stringify(v.which) : ""}`,
    ),
  );
  const ov = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  console.log(
    `  horizontal overflow: ${ov.sw > ov.cw ? `YES (${ov.sw} > ${ov.cw})` : "none"}`,
  );
  console.log(`  page height: ${total}`);
  await page.close();
}

await shoot("desktop 1440", { viewport: { width, height } }, "d");
await shoot(
  "mobile 390",
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "m",
);

await browser.close();
