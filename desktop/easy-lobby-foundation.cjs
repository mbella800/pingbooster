"use strict";

const EASY_LOBBY_DISCLAIMER =
  "Easy Lobby compares direct latency to regional public endpoints. " +
  "It does not alter matchmaking, spoof a region, or promise easier opponents.";

const DEFAULT_REGION_TARGETS = Object.freeze([
  {
    id: "eu-central",
    name: "Central Europe",
    city: "Frankfurt",
    host: "ec2.eu-central-1.amazonaws.com",
    port: 443,
  },
  {
    id: "eu-west",
    name: "Western Europe",
    city: "London",
    host: "ec2.eu-west-2.amazonaws.com",
    port: 443,
  },
  {
    id: "us-east",
    name: "North America East",
    city: "Virginia",
    host: "ec2.us-east-1.amazonaws.com",
    port: 443,
  },
  {
    id: "us-west",
    name: "North America West",
    city: "Oregon",
    host: "ec2.us-west-2.amazonaws.com",
    port: 443,
  },
  {
    id: "asia-southeast",
    name: "Southeast Asia",
    city: "Singapore",
    host: "ec2.ap-southeast-1.amazonaws.com",
    port: 443,
  },
  {
    id: "asia-northeast",
    name: "Northeast Asia",
    city: "Tokyo",
    host: "ec2.ap-northeast-1.amazonaws.com",
    port: 443,
  },
]);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function summarizeRegion(target, samples) {
  const valid = samples.filter(Number.isFinite);
  const latency = median(valid);
  const average = valid.length
    ? valid.reduce((total, value) => total + value, 0) / valid.length
    : null;
  const variance = valid.length
    ? valid.reduce((total, value) => total + (value - average) ** 2, 0) / valid.length
    : null;
  const failureRate = Math.round(((samples.length - valid.length) / samples.length) * 100);
  const jitter = variance === null ? null : Math.round(Math.sqrt(variance));
  return {
    id: target.id,
    name: target.name,
    city: target.city,
    latency,
    jitter,
    failureRate,
    samples: samples.length,
    reachable: latency !== null,
  };
}

function regionScore(result) {
  if (!result.reachable) return Number.POSITIVE_INFINITY;
  return result.latency + (result.jitter ?? 0) * 1.5 + result.failureRate * 4;
}

function rankRegionResults(results) {
  return [...results]
    .map((result) => ({ ...result, score: regionScore(result) }))
    .sort((left, right) => left.score - right.score);
}

function recommendationConfidence(ranked) {
  if (!ranked[0]?.reachable) return "none";
  const first = ranked[0];
  const second = ranked.find((result, index) => index > 0 && result.reachable);
  const gap = second ? second.score - first.score : 0;
  if (first.failureRate === 0 && (first.jitter ?? 99) <= 8 && gap >= 10) return "high";
  if (first.failureRate <= 34 && (first.jitter ?? 99) <= 20) return "medium";
  return "low";
}

class EasyLobbyFoundation {
  constructor({
    probe,
    detectRunningGame,
    emit = () => {},
    targets = DEFAULT_REGION_TARGETS,
  }) {
    this.probe = probe;
    this.detectRunningGame = detectRunningGame;
    this.emit = emit;
    this.targets = targets;
    this.lastComparison = null;
  }

  regions() {
    return this.targets.map(({ id, name, city }) => ({ id, name, city }));
  }

  async compare(options = {}) {
    const attempts = Math.min(5, Math.max(2, Number(options.attempts) || 3));
    const timeout = Math.min(2500, Math.max(600, Number(options.timeout) || 1300));
    const requestedIds = Array.isArray(options.regionIds)
      ? new Set(options.regionIds.filter((value) => typeof value === "string"))
      : null;
    const targets = requestedIds
      ? this.targets.filter((target) => requestedIds.has(target.id))
      : this.targets;
    const selectedTargets = targets.length ? targets : this.targets;
    const game = options.gameName
      ? { name: String(options.gameName), process: null, pid: null }
      : await this.detectRunningGame();

    this.emit("easy-lobby:state-changed", {
      status: "measuring",
      gameName: game?.name ?? null,
      testedRegions: selectedTargets.length,
    });

    const measured = await Promise.all(
      selectedTargets.map(async (target) => {
        const samples = [];
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          samples.push(await this.probe(target.host, target.port, timeout));
        }
        return summarizeRegion(target, samples);
      }),
    );
    const ranked = rankRegionResults(measured);
    const best = ranked.find((result) => result.reachable) ?? null;

    this.lastComparison = {
      feature: "easy-lobby",
      status: best ? "ready" : "unavailable",
      game,
      gameName: game?.name ?? "Manual selection",
      results: ranked,
      recommended: best
        ? {
            id: best.id,
            name: best.name,
            city: best.city,
            latency: best.latency,
            jitter: best.jitter,
            confidence: recommendationConfidence(ranked),
            reason: "Lowest measured direct-region score for latency, variation, and failed connections.",
          }
        : null,
      sessionRouting: {
        mode: "direct-only",
        applied: false,
        relayAvailable: false,
        explanation:
          "This preview recommends a network region but does not reroute the game session.",
      },
      matchmaking: {
        modified: false,
        supported: false,
        explanation:
          "Ping Optimizer does not manipulate skill matching, opponent selection, or account region.",
      },
      metric: "TCP connection response to regional public endpoints",
      disclaimer: EASY_LOBBY_DISCLAIMER,
      testedAt: new Date().toISOString(),
    };
    this.emit("easy-lobby:state-changed", this.lastComparison);
    return this.lastComparison;
  }

  state() {
    return {
      feature: "easy-lobby",
      status: this.lastComparison?.status ?? "idle",
      lastComparison: this.lastComparison,
      matchmakingModified: false,
      routingApplied: false,
      disclaimer: EASY_LOBBY_DISCLAIMER,
    };
  }
}

module.exports = {
  DEFAULT_REGION_TARGETS,
  EASY_LOBBY_DISCLAIMER,
  EasyLobbyFoundation,
  rankRegionResults,
  regionScore,
  summarizeRegion,
};
