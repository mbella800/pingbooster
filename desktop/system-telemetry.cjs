"use strict";

function gpuEngineKey(instanceName) {
  const normalized = String(instanceName ?? "").toLowerCase();
  const match = normalized.match(
    /(luid_[^_]+_[^_]+_phys_\d+)_eng_(\d+)_engtype_([^_]+)/,
  );
  return match ? `${match[1]}:eng_${match[2]}:${match[3]}` : normalized;
}

function parseGpuCounterJson(output) {
  if (!String(output ?? "").trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values
    .map((sample) => ({
      instanceName: String(sample.InstanceName ?? sample.instanceName ?? ""),
      value: Number(sample.CookedValue ?? sample.cookedValue),
    }))
    .filter(
      (sample) =>
        sample.instanceName &&
        Number.isFinite(sample.value) &&
        sample.value >= 0,
    );
}

function aggregateGpuUtilization(samples) {
  if (!samples.length) return null;
  const engines = new Map();
  samples.forEach((sample) => {
    const key = gpuEngineKey(sample.instanceName);
    engines.set(key, (engines.get(key) ?? 0) + sample.value);
  });
  const busiestEngine = Math.max(...engines.values());
  return Math.round(Math.min(100, Math.max(0, busiestEngine)));
}

async function readWindowsGpuUtilization(execProgram) {
  const script = [
    "$gpuCounters = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples",
    "$gpuCounters | Select-Object InstanceName,CookedValue | ConvertTo-Json -Compress",
  ].join("; ");
  try {
    const output = await execProgram("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    const samples = parseGpuCounterJson(output);
    const percent = aggregateGpuUtilization(samples);
    return {
      available: percent !== null,
      percent,
      source: "Windows GPU Engine performance counters",
      sampledEngines: new Set(samples.map((sample) => gpuEngineKey(sample.instanceName))).size,
      reason:
        percent === null
          ? "Windows did not expose GPU engine utilization counters."
          : null,
    };
  } catch {
    return {
      available: false,
      percent: null,
      source: "Windows GPU Engine performance counters",
      sampledEngines: 0,
      reason: "Windows did not expose GPU engine utilization counters.",
    };
  }
}

module.exports = {
  aggregateGpuUtilization,
  gpuEngineKey,
  parseGpuCounterJson,
  readWindowsGpuUtilization,
};
