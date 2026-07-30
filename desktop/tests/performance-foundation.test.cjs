"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FpsBoostFoundation,
  calculateCpuBusyPercent,
  sampleSystemLoad,
} = require("../performance-foundation.cjs");

function cpu(times) {
  return [{ model: "Test CPU", speed: 3000, times }];
}

function fakeOs(cpuSnapshots) {
  let cpuIndex = 0;
  return {
    cpus: () => cpuSnapshots[Math.min(cpuIndex++, cpuSnapshots.length - 1)],
    totalmem: () => 16 * 1024 * 1024 * 1024,
    freemem: () => 6 * 1024 * 1024 * 1024,
    platform: () => "win32",
    release: () => "11",
  };
}

test("calculates aggregate CPU busy time from operating-system ticks", () => {
  assert.equal(
    calculateCpuBusyPercent(
      { idle: 100, total: 200 },
      { idle: 120, total: 300 },
    ),
    80,
  );
  assert.equal(
    calculateCpuBusyPercent(
      { idle: 100, total: 200 },
      { idle: 100, total: 200 },
    ),
    null,
  );
});

test("samples real system-load fields without inventing an FPS value", async () => {
  const osModule = fakeOs([
    cpu({ user: 50, nice: 0, sys: 50, idle: 100, irq: 0 }),
    cpu({ user: 90, nice: 0, sys: 70, idle: 140, irq: 0 }),
  ]);
  const result = await sampleSystemLoad({
    osModule,
    sampleMs: 500,
    wait: async () => {},
  });

  assert.equal(result.kind, "windows-system-load");
  assert.equal(result.cpuBusyPercent, 60);
  assert.equal(result.memory.totalMiB, 16384);
  assert.equal(result.memory.usedPercent, 63);
});

test("scan exposes live CPU, RAM and available GPU telemetry", async () => {
  const foundation = new FpsBoostFoundation({
    detectRunningGame: async () => ({
      name: "Fortnite",
      process: "Fortnite.exe",
      pid: 42,
    }),
    getPowerInfo: () => ({
      currentGuid: "balanced",
      currentName: "Balanced",
      highPerformanceAvailable: true,
      highPerformanceActive: false,
    }),
    applyProfile: async () => ({ applied: [], skipped: [], active: false }),
    restoreProfile: async () => ({ restored: [], failed: [], active: false }),
    getSessionState: () => ({ active: false, gameName: null }),
    osModule: fakeOs([
      cpu({ user: 50, nice: 0, sys: 50, idle: 100, irq: 0 }),
      cpu({ user: 90, nice: 0, sys: 70, idle: 140, irq: 0 }),
      cpu({ user: 90, nice: 0, sys: 70, idle: 140, irq: 0 }),
    ]),
    wait: async () => {},
    getGpuUtilization: async () => ({
      available: true,
      percent: 37,
      source: "Windows GPU Engine performance counters",
      sampledEngines: 2,
      reason: null,
    }),
  });

  const scan = await foundation.scan();

  assert.equal(scan.system.telemetry.cpuBusyPercent, 60);
  assert.equal(scan.system.telemetry.ramUsedPercent, 63);
  assert.equal(scan.system.telemetry.gpuBusyPercent, 37);
  assert.equal(scan.system.telemetry.fps.value, null);
  assert.equal(scan.actions[0].status, "ready");
});

test("apply and rollback expose only reversible settings and no FPS claim", async () => {
  const events = [];
  let active = false;
  const foundation = new FpsBoostFoundation({
    detectRunningGame: async () => ({ name: "VALORANT", pid: 99 }),
    getPowerInfo: () => ({
      highPerformanceAvailable: true,
      highPerformanceActive: false,
    }),
    applyProfile: async () => {
      active = true;
      return {
        applied: ["High Performance power plan"],
        skipped: [],
        game: { name: "VALORANT", pid: 99 },
        active: true,
      };
    },
    restoreProfile: async () => {
      active = false;
      return {
        restored: ["Previous power plan"],
        failed: [],
        active: false,
      };
    },
    getSessionState: () => ({ active, gameName: active ? "VALORANT" : null }),
    emit: (channel, payload) => events.push({ channel, payload }),
  });

  const applied = await foundation.apply({ powerPlan: true });
  assert.deepEqual(applied.applied, ["High Performance power plan"]);
  assert.equal(applied.fpsGain, null);
  assert.equal(applied.verifiedFpsGain, false);

  const restored = await foundation.rollback();
  assert.deepEqual(restored.restored, ["Previous power plan"]);
  assert.equal(restored.active, false);
  assert.ok(events.some((event) => event.channel === "fps:state-changed"));
});

test("before and after samples compare system load but never manufacture FPS", async () => {
  const foundation = new FpsBoostFoundation({
    detectRunningGame: async () => null,
    getPowerInfo: () => ({
      highPerformanceAvailable: true,
      highPerformanceActive: false,
    }),
    applyProfile: async () => ({ applied: [], skipped: [], active: false }),
    restoreProfile: async () => ({ restored: [], failed: [], active: false }),
    getSessionState: () => ({ active: false, gameName: null }),
    osModule: fakeOs([
      cpu({ user: 50, nice: 0, sys: 50, idle: 100, irq: 0 }),
      cpu({ user: 100, nice: 0, sys: 80, idle: 120, irq: 0 }),
      cpu({ user: 100, nice: 0, sys: 80, idle: 120, irq: 0 }),
      cpu({ user: 130, nice: 0, sys: 100, idle: 170, irq: 0 }),
    ]),
    wait: async () => {},
  });

  await foundation.benchmark({ phase: "baseline", sampleMs: 250 });
  const after = await foundation.benchmark({ phase: "after", sampleMs: 250 });

  assert.equal(after.comparison.fpsDelta, null);
  assert.equal(after.comparison.verifiedFpsGain, false);
  assert.match(after.comparison.interpretation, /not an in-game FPS benchmark/i);
});
