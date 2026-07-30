"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EasyLobbyFoundation,
  rankRegionResults,
  summarizeRegion,
} = require("../easy-lobby-foundation.cjs");

const targets = [
  { id: "near", name: "Near", city: "Near City", host: "near.test", port: 443 },
  { id: "far", name: "Far", city: "Far City", host: "far.test", port: 443 },
];

test("summarizes latency, jitter and failed connection samples", () => {
  const result = summarizeRegion(targets[0], [20, 22, null]);
  assert.equal(result.latency, 21);
  assert.equal(result.jitter, 1);
  assert.equal(result.failureRate, 33);
  assert.equal(result.reachable, true);
});

test("ranking penalizes unstable and failed regional endpoints", () => {
  const ranked = rankRegionResults([
    {
      id: "unstable",
      latency: 18,
      jitter: 25,
      failureRate: 34,
      reachable: true,
    },
    {
      id: "stable",
      latency: 24,
      jitter: 2,
      failureRate: 0,
      reachable: true,
    },
  ]);
  assert.equal(ranked[0].id, "stable");
});

test("Easy Lobby recommends measured network latency without changing matchmaking", async () => {
  const events = [];
  const probeValues = {
    "near.test": [20, 21, 22],
    "far.test": [90, 94, 92],
  };
  const counters = new Map();
  const foundation = new EasyLobbyFoundation({
    targets,
    detectRunningGame: async () => null,
    probe: async (host) => {
      const index = counters.get(host) ?? 0;
      counters.set(host, index + 1);
      return probeValues[host][index];
    },
    emit: (channel, payload) => events.push({ channel, payload }),
  });

  const comparison = await foundation.compare({
    gameName: "Fortnite",
    attempts: 3,
  });

  assert.deepEqual(foundation.regions(), [
    { id: "near", name: "Near", city: "Near City" },
    { id: "far", name: "Far", city: "Far City" },
  ]);
  assert.equal(comparison.recommended.id, "near");
  assert.equal(comparison.matchmaking.modified, false);
  assert.equal(comparison.matchmaking.supported, false);
  assert.equal(comparison.sessionRouting.applied, false);
  assert.equal(comparison.sessionRouting.mode, "direct-only");
  assert.match(comparison.disclaimer, /does not alter matchmaking/i);
  assert.equal(events[0].payload.status, "measuring");
  assert.equal(events.at(-1).payload.status, "ready");
});

test("Easy Lobby reports unavailable when every regional probe fails", async () => {
  const foundation = new EasyLobbyFoundation({
    targets,
    detectRunningGame: async () => null,
    probe: async () => null,
  });

  const comparison = await foundation.compare({ attempts: 2 });

  assert.equal(comparison.status, "unavailable");
  assert.equal(comparison.recommended, null);
  assert.equal(comparison.matchmaking.modified, false);
});
