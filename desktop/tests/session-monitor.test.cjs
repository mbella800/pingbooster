"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { SessionMonitor } = require("../session-monitor.cjs");

function makeMonitor(overrides = {}) {
  const events = [];
  const monitor = new SessionMonitor({
    detectRunningGame: async () => null,
    isPidRunning: () => true,
    getSessionState: () => ({ active: false }),
    restoreSession: async () => ({ restored: [], failed: [], active: false }),
    emit: (channel, payload) => events.push({ channel, payload }),
    ...overrides,
  });
  return { monitor, events };
}

test("emits game changes once per process identity", async () => {
  const game = { process: "game.exe", name: "Game", pid: 42 };
  const { monitor, events } = makeMonitor({ detectRunningGame: async () => game });

  await monitor.tick();
  await monitor.tick();

  assert.deepEqual(events, [{ channel: "game:changed", payload: game }]);
});

test("restores temporary settings when the tracked game closes", async () => {
  let restoreCalls = 0;
  const { monitor, events } = makeMonitor({
    isPidRunning: () => false,
    getSessionState: () => ({ active: true, gamePid: 88, gameName: "VALORANT" }),
    restoreSession: async () => {
      restoreCalls += 1;
      return { restored: ["Previous power plan"], failed: [], active: false };
    },
  });

  await monitor.tick();

  assert.equal(restoreCalls, 1);
  assert.equal(events[0].channel, "session:restored");
  assert.match(events[0].payload.message, /VALORANT closed/);
  assert.equal(events[0].payload.active, false);
});

test("reports a failed automatic restore honestly", async () => {
  let now = 1_000;
  let restoreCalls = 0;
  const { monitor, events } = makeMonitor({
    isPidRunning: () => false,
    nowFn: () => now,
    restoreRetryMs: 15_000,
    getSessionState: () => ({
      active: true,
      gamePid: 88,
      gameProcess: "game.exe",
      gameName: "VALORANT",
    }),
    restoreSession: async () => {
      restoreCalls += 1;
      return {
        restored: [],
        failed: ["Previous power plan could not be restored"],
        active: true,
      };
    },
  });

  await monitor.tick();
  await monitor.tick();
  now += 15_000;
  await monitor.tick();

  const restoreEvents = events.filter((event) => event.channel === "session:restored");
  assert.equal(restoreCalls, 2);
  assert.equal(restoreEvents.length, 1);
  assert.equal(restoreEvents[0].payload.active, true);
  assert.match(restoreEvents[0].payload.message, /could not be restored automatically/);
});

test("checks both the tracked PID and process identity", async () => {
  let receivedProcess = null;
  const { monitor } = makeMonitor({
    isPidRunning: (_pid, process) => {
      receivedProcess = process;
      return true;
    },
    getSessionState: () => ({
      active: true,
      gamePid: 88,
      gameProcess: "game.exe",
      gameName: "Game",
    }),
  });

  await monitor.tick();

  assert.equal(receivedProcess, "game.exe");
});

test("does not restore while the tracked game is still running", async () => {
  let restoreCalls = 0;
  const { monitor } = makeMonitor({
    isPidRunning: () => true,
    getSessionState: () => ({ active: true, gamePid: 88, gameName: "VALORANT" }),
    restoreSession: async () => {
      restoreCalls += 1;
      return { restored: [], failed: [], active: false };
    },
  });

  await monitor.tick();

  assert.equal(restoreCalls, 0);
});

test("start and stop own exactly one interval", () => {
  const timers = [];
  const cleared = [];
  const { monitor } = makeMonitor({
    setIntervalFn: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => cleared.push(timer),
  });

  monitor.start();
  monitor.start();
  monitor.stop();

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 3000);
  assert.deepEqual(cleared, [timers[0]]);
});
