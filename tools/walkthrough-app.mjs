/**
 * Functional walkthrough of the desktop app's renderer in a plain browser.
 *
 * Shims the Electron preload API with STATEFUL, realistic fakes, then drives
 * every user flow — one-click optimize, network re-test, performance
 * apply/restore, safe repair, history, settings save — capturing a screenshot
 * of each resulting state and failing loudly on any page error.
 *
 * This verifies the renderer end to end. What it cannot verify is main.cjs's
 * Windows-native side (tasklist, powercfg, priority), which only runs on
 * Windows; the shim returns the same shapes main.cjs produces.
 *
 * Usage: node tools/walkthrough-app.mjs <outdir>
 */
import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] ?? "/tmp/app-walkthrough";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const problems = [];
page.on("pageerror", (e) => problems.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`CONSOLE: ${m.text().slice(0, 160)}`));

await page.addInitScript(() => {
  const games = [
    ["FortniteClient-Win64-Shipping.exe", "Fortnite", "Competitive"],
    ["VALORANT-Win64-Shipping.exe", "VALORANT", "Competitive"],
    ["cs2.exe", "Counter-Strike 2", "Competitive"],
    ["League of Legends.exe", "League of Legends", "Competitive"],
    ["r5apex.exe", "Apex Legends", "Competitive"],
    ["Overwatch.exe", "Overwatch 2", "Competitive"],
    ["RocketLeague.exe", "Rocket League", "Competitive"],
    ["RobloxPlayerBeta.exe", "Roblox", "Automatic"],
    ["GenshinImpact.exe", "Genshin Impact", "Stable"],
    ["cod.exe", "Call of Duty", "Competitive"],
    ["Wow.exe", "World of Warcraft", "Stable"],
    ["dota2.exe", "Dota 2", "Competitive"],
  ].map(([process, name, recommendedMode]) => ({ process, name, recommendedMode }));

  // Stateful: history accumulates, performance session toggles — mirrors the
  // shapes main.cjs returns so the renderer is exercised realistically.
  const history = [];
  let perfActive = false;

  window.pingOptimizer = {
    listGames: async () => games,
    detectGame: async () => ({
      process: "VALORANT-Win64-Shipping.exe",
      name: "VALORANT",
      recommendedMode: "Competitive",
      pid: 4242,
    }),
    runDiagnostics: async (request) => {
      const report = {
        results: [
          { name: "Cloudflare edge", latency: 12, jitter: 2, failureRate: 0, attempts: 5 },
          { name: "Google edge", latency: 14, jitter: 3, failureRate: 0, attempts: 5 },
          { name: "Quad9 edge", latency: null, jitter: null, failureRate: 100, attempts: 5 },
        ],
        best: { name: "Cloudflare edge", latency: 12, jitter: 2, failureRate: 0, attempts: 5 },
        gameName: request?.gameName ?? "Manual selection",
        mode: request?.mode ?? "Automatic",
        metric: "TCP connection response",
        testedAt: new Date().toISOString(),
      };
      history.unshift(report);
      return report;
    },
    applyPerformance: async (options) => {
      perfActive = true;
      return {
        applied: [
          ...(options?.powerPlan ? ["High Performance power plan"] : []),
          ...(options?.processPriority ? ["VALORANT process priority"] : []),
        ],
        skipped: [],
        game: { name: "VALORANT", pid: 4242 },
        active: true,
      };
    },
    restorePerformance: async () => {
      perfActive = false;
      return {
        restored: ["Previous power plan", "Previous process priority"],
        failed: [],
        active: false,
      };
    },
    runSafeRepair: async () => ({
      checks: [
        { name: "DNS resolution", status: "passed", detail: "1.1.1.1" },
        { name: "DNS cache", status: "repaired", detail: "Windows DNS cache was flushed" },
        { name: "Active adapters", status: "passed", detail: "Ethernet · 2.5 Gbps" },
      ],
      testedAt: new Date().toISOString(),
    }),
    getHistory: async () => history,
    getSettings: async () => ({
      autoDetect: true,
      diagnosticsOnLaunch: false,
      minimizeToTray: false,
      preferredMode: "Automatic",
    }),
    saveSettings: async (s) => s,
    minimize: () => {},
    close: () => {},
  };
});

const shot = async (name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("✓", name);
};

await page.goto("file:///home/user/pingbooster/desktop/index.html", { waitUntil: "load" });
await page.waitForTimeout(1000);
await shot("01-home-detected");

// One-click flow: the button everything hangs off.
await page.click("#optimize");
await page.waitForTimeout(900);
await shot("02-home-after-optimize");

const metrics = await page.evaluate(() => ({
  latency: document.querySelector("#metric-latency")?.textContent?.trim(),
  jitter: document.querySelector("#metric-jitter")?.textContent?.trim(),
  loss: document.querySelector("#metric-loss")?.textContent?.trim(),
  optimizeLabel: document.querySelector("#optimize-label")?.textContent,
  badge: document.querySelector("#evidence-badge")?.textContent,
  sidebar: document.querySelector("#sidebar-state")?.textContent,
}));
console.log("after one-click:", JSON.stringify(metrics));
if (!metrics.latency?.includes("12")) problems.push(`latency metric did not update: "${metrics.latency}"`);
if (metrics.badge !== "MEASURED") problems.push(`badge should be MEASURED, got "${metrics.badge}"`);

for (const view of ["network", "performance", "tools", "history", "settings", "games"]) {
  await page.click(`.nav-item[data-view="${view}"]`);
  await page.waitForTimeout(450);

  if (view === "network") {
    await shot("03-network-populated");
    const failedRow = await page.evaluate(
      () => document.querySelector("#edge-results .failed strong")?.textContent,
    );
    if (failedRow !== "Failed") problems.push(`unreachable edge row not rendered: "${failedRow}"`);
  }

  if (view === "performance") {
    await page.click("#apply-performance");
    await page.waitForTimeout(500);
    await shot("04-performance-applied");
    const applied = await page.evaluate(() => document.querySelector("#performance-result")?.textContent);
    if (!applied?.includes("Applied:")) problems.push(`apply result missing: "${applied}"`);
    await page.click("#restore-performance");
    await page.waitForTimeout(500);
    await shot("05-performance-restored");
    const restored = await page.evaluate(() => document.querySelector("#performance-result")?.textContent);
    if (!restored?.includes("Restored:")) problems.push(`restore result missing: "${restored}"`);
  }

  if (view === "tools") {
    await page.click("#run-repair");
    await page.waitForTimeout(500);
    await shot("06-tools-repaired");
  }

  if (view === "history") {
    await shot("07-history");
    const rows = await page.evaluate(() => document.querySelectorAll(".history-item").length);
    if (rows < 1) problems.push("history should contain the diagnosis run");
  }

  if (view === "settings") {
    await page.selectOption("#setting-mode", "Lowest latency");
    await page.click("#save-settings");
    await page.waitForTimeout(400);
    await shot("08-settings-saved");
    const mode = await page.evaluate(() => document.querySelector("#mode-select")?.value);
    if (mode !== "Lowest latency") problems.push(`saved mode did not propagate: "${mode}"`);
  }

  if (view === "games") {
    await shot("09-games");
    // Selecting a profile must land back on home with the game applied.
    await page.click(".game-profile button");
    await page.waitForTimeout(450);
    await shot("10-home-profile-selected");
    const name = await page.evaluate(() => document.querySelector("#game-name")?.textContent);
    if (name !== "Fortnite") problems.push(`profile selection should set Fortnite, got "${name}"`);
  }
}

console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.map((p) => "  ✗ " + p).join("\n") : "\nAll flows passed with no page errors.");
await browser.close();
process.exit(problems.length ? 1 : 0);
