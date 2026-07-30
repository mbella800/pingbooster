"use strict";

const os = require("node:os");
const { setTimeout: delay } = require("node:timers/promises");

const FPS_DISCLAIMER =
  "Ping Optimizer does not inject into games or promise an FPS increase. " +
  "It measures Windows system load and applies only reversible session settings.";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readCpuTotals(osModule = os) {
  return osModule.cpus().reduce(
    (totals, cpu) => {
      const times = cpu.times ?? {};
      const total =
        (times.user ?? 0) +
        (times.nice ?? 0) +
        (times.sys ?? 0) +
        (times.idle ?? 0) +
        (times.irq ?? 0);
      totals.idle += times.idle ?? 0;
      totals.total += total;
      return totals;
    },
    { idle: 0, total: 0 },
  );
}

function calculateCpuBusyPercent(start, end) {
  const totalDelta = end.total - start.total;
  const idleDelta = end.idle - start.idle;
  if (totalDelta <= 0) return null;
  return Math.round(clamp((1 - idleDelta / totalDelta) * 100, 0, 100));
}

function memorySnapshot(osModule = os) {
  const totalBytes = osModule.totalmem();
  const freeBytes = osModule.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const toMiB = (bytes) => Math.round(bytes / 1024 / 1024);
  return {
    totalMiB: toMiB(totalBytes),
    availableMiB: toMiB(freeBytes),
    usedMiB: toMiB(usedBytes),
    usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : null,
  };
}

async function sampleSystemLoad({
  osModule = os,
  sampleMs = 1250,
  wait = delay,
} = {}) {
  const safeSampleMs = clamp(Number(sampleMs) || 1250, 250, 5000);
  const cpuStart = readCpuTotals(osModule);
  const memoryStart = memorySnapshot(osModule);
  await wait(safeSampleMs);
  const cpuEnd = readCpuTotals(osModule);
  const memoryEnd = memorySnapshot(osModule);
  return {
    kind: "windows-system-load",
    durationMs: safeSampleMs,
    cpuBusyPercent: calculateCpuBusyPercent(cpuStart, cpuEnd),
    memory: memoryEnd,
    memoryAvailableDeltaMiB: memoryEnd.availableMiB - memoryStart.availableMiB,
    measuredAt: new Date().toISOString(),
  };
}

function capabilities() {
  return {
    sessionPowerPlan: {
      supported: true,
      reversible: true,
      scope: "Windows system power plan while a supported game is running",
    },
    gameProcessModification: {
      supported: false,
      reason: "Ping Optimizer never opens, injects into, or modifies a game process.",
    },
    frameRateMeasurement: {
      supported: false,
      source: null,
      reason: "A signed OS frame-timing collector is not bundled in this preview.",
    },
    timerResolutionTweak: {
      supported: false,
      reason: "Timer-resolution tweaks are not used because they do not prove a game FPS gain.",
    },
  };
}

class FpsBoostFoundation {
  constructor({
    detectRunningGame,
    getPowerInfo,
    applyProfile,
    restoreProfile,
    getSessionState,
    emit = () => {},
    osModule = os,
    wait = delay,
    getGpuUtilization = async () => ({
      available: false,
      percent: null,
      source: null,
      sampledEngines: 0,
      reason: "GPU utilization is unavailable.",
    }),
  }) {
    this.detectRunningGame = detectRunningGame;
    this.getPowerInfo = getPowerInfo;
    this.applyProfile = applyProfile;
    this.restoreProfile = restoreProfile;
    this.getSessionState = getSessionState;
    this.emit = emit;
    this.osModule = osModule;
    this.wait = wait;
    this.getGpuUtilization = getGpuUtilization;
    this.lastScan = null;
    this.lastBenchmark = null;
    this.baseline = null;
    this.lastAction = null;
  }

  async telemetry(options = {}) {
    const [load, gpu] = await Promise.all([
      sampleSystemLoad({
        osModule: this.osModule,
        sampleMs: options.sampleMs ?? 600,
        wait: this.wait,
      }),
      this.getGpuUtilization(),
    ]);
    return {
      feature: "system-telemetry",
      cpuBusyPercent: load.cpuBusyPercent,
      ramUsedPercent: load.memory.usedPercent,
      ramUsedMiB: load.memory.usedMiB,
      ramAvailableMiB: load.memory.availableMiB,
      ramTotalMiB: load.memory.totalMiB,
      gpuBusyPercent: gpu.available ? gpu.percent : null,
      gpu,
      fps: {
        available: false,
        value: null,
        reason: capabilities().frameRateMeasurement.reason,
      },
      measuredAt: load.measuredAt,
    };
  }

  async scan() {
    const [game, power, telemetry] = await Promise.all([
      this.detectRunningGame(),
      Promise.resolve(this.getPowerInfo()),
      this.telemetry({ sampleMs: 600 }),
    ]);
    const memory = memorySnapshot(this.osModule);
    const cpuCount = this.osModule.cpus().length;
    const powerStatus = !power.highPerformanceAvailable
      ? "unavailable"
      : power.highPerformanceActive
        ? "already-active"
        : game?.pid
          ? "ready"
          : "requires-running-game";

    this.lastScan = {
      feature: "fps-boost",
      game,
      system: {
        platform: this.osModule.platform(),
        release: this.osModule.release(),
        cpuLogicalProcessors: cpuCount,
        memory,
        power,
        telemetry,
      },
      actions: [
        {
          id: "session-power-plan",
          label: "Performance power plan",
          status: powerStatus,
          reversible: true,
          description:
            "Uses the Windows High Performance plan only for the detected game session, then restores the previous plan.",
        },
        {
          id: "background-process-review",
          label: "Background app review",
          status: "advisory-only",
          reversible: true,
          description:
            "Reports system pressure without terminating apps or changing another process automatically.",
        },
        {
          id: "frame-time-measurement",
          label: "In-game FPS measurement",
          status: "not-bundled",
          reversible: true,
          description:
            "No frame-rate value is shown until an OS-level collector is bundled and independently verified.",
        },
      ],
      capabilities: capabilities(),
      disclaimer: FPS_DISCLAIMER,
      scannedAt: new Date().toISOString(),
    };
    this.emit("fps:state-changed", await this.state());
    return this.lastScan;
  }

  async benchmark(options = {}) {
    const phase = options.phase === "after" ? "after" : options.phase === "baseline" ? "baseline" : "sample";
    this.emit("fps:benchmark-progress", { phase, stage: "sampling", percent: 10 });
    const game = await this.detectRunningGame();
    const measurement = await sampleSystemLoad({
      osModule: this.osModule,
      sampleMs: options.sampleMs,
      wait: this.wait,
    });
    let comparison = null;

    if (phase === "baseline") {
      this.baseline = measurement;
    } else if (phase === "after" && this.baseline) {
      comparison = {
        cpuBusyDeltaPercent:
          measurement.cpuBusyPercent === null || this.baseline.cpuBusyPercent === null
            ? null
            : measurement.cpuBusyPercent - this.baseline.cpuBusyPercent,
        availableMemoryDeltaMiB:
          measurement.memory.availableMiB - this.baseline.memory.availableMiB,
        fpsDelta: null,
        verifiedFpsGain: false,
        interpretation:
          "This is a before/after Windows load comparison. It is not an in-game FPS benchmark.",
      };
    }

    this.lastBenchmark = {
      feature: "fps-boost",
      phase,
      game,
      measurement,
      comparison,
      fps: {
        available: false,
        value: null,
        delta: null,
        reason: capabilities().frameRateMeasurement.reason,
      },
      disclaimer: FPS_DISCLAIMER,
    };
    this.emit("fps:benchmark-progress", { phase, stage: "complete", percent: 100 });
    this.emit("fps:state-changed", await this.state());
    return this.lastBenchmark;
  }

  async apply(options = {}) {
    const result = await this.applyProfile({
      powerPlan: options.powerPlan !== false,
    });
    this.lastAction = {
      type: "apply",
      at: new Date().toISOString(),
      applied: result.applied,
      skipped: result.skipped,
    };
    const response = {
      feature: "fps-boost",
      ...result,
      verifiedFpsGain: false,
      fpsGain: null,
      explanation: result.applied.length
        ? "A reversible Windows session setting was applied. Any game benefit must be verified with repeatable measurements."
        : "No Windows setting was changed.",
      disclaimer: FPS_DISCLAIMER,
    };
    this.emit("fps:state-changed", await this.state());
    return response;
  }

  async rollback() {
    const result = await this.restoreProfile();
    this.lastAction = {
      type: "rollback",
      at: new Date().toISOString(),
      restored: result.restored,
      failed: result.failed,
    };
    const response = {
      feature: "fps-boost",
      ...result,
      explanation: result.active
        ? "A previous Windows setting still needs attention."
        : "The previous Windows session settings are restored.",
      disclaimer: FPS_DISCLAIMER,
    };
    this.emit("fps:state-changed", await this.state());
    return response;
  }

  async state() {
    const session = await Promise.resolve(this.getSessionState());
    return {
      feature: "fps-boost",
      active: Boolean(session.active),
      gameName: session.gameName ?? null,
      lastScan: this.lastScan,
      lastBenchmark: this.lastBenchmark,
      hasBaseline: Boolean(this.baseline),
      lastAction: this.lastAction,
      capabilities: capabilities(),
      disclaimer: FPS_DISCLAIMER,
    };
  }
}

module.exports = {
  FPS_DISCLAIMER,
  FpsBoostFoundation,
  calculateCpuBusyPercent,
  memorySnapshot,
  sampleSystemLoad,
};
