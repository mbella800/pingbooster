import { chromium } from "playwright";

// Screenshots the desktop app's views in a plain browser by shimming the
// Electron preload API (window.pingOptimizer) before the page's own scripts
// run. Rendering-only harness — none of the shimmed behaviour ships.
const out = process.argv[2] ?? "/tmp/app.png";
const view = process.argv[3] ?? "games";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

  window.pingOptimizer = {
    listGames: async () => games,
    detectGame: async () => ({ process: games[1].process, name: "VALORANT", recommendedMode: "Competitive", pid: 4242 }),
    runDiagnostics: async () => ({ results: [], best: null, gameName: "VALORANT", mode: "Automatic", testedAt: new Date().toISOString() }),
    applyPerformance: async () => ({ applied: [], skipped: [], game: null, active: false }),
    restorePerformance: async () => ({ restored: [], failed: [], active: false }),
    runSafeRepair: async () => ({ checks: [], testedAt: new Date().toISOString() }),
    getHistory: async () => [],
    getSettings: async () => ({ autoDetect: true, diagnosticsOnLaunch: false, minimizeToTray: false, preferredMode: "Automatic" }),
    saveSettings: async (s) => s,
    minimize: () => {},
    close: () => {},
  };
});

await page.goto("file:///home/user/pingbooster/desktop/index.html", { waitUntil: "load" });
await page.waitForTimeout(1200);

if (view !== "home") {
  await page.click(`.nav-item[data-view="${view}"]`);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: out });
console.log("written:", out);
await browser.close();
