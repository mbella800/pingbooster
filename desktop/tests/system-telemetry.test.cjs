"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  aggregateGpuUtilization,
  gpuEngineKey,
  parseGpuCounterJson,
  readWindowsGpuUtilization,
} = require("../system-telemetry.cjs");

test("parses PowerShell GPU counter JSON in single and array forms", () => {
  const single = parseGpuCounterJson(
    JSON.stringify({
      InstanceName: "pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D",
      CookedValue: 12.5,
    }),
  );
  assert.equal(single.length, 1);
  assert.equal(single[0].value, 12.5);
  assert.deepEqual(parseGpuCounterJson("not json"), []);
});

test("groups per-process counters by physical GPU engine and returns the busiest engine", () => {
  const first = "pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D";
  const second = "pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D";
  const compute = "pid_2_luid_0x0_0x1_phys_0_eng_1_engtype_Compute";
  assert.equal(gpuEngineKey(first), gpuEngineKey(second));
  assert.equal(
    aggregateGpuUtilization([
      { instanceName: first, value: 20 },
      { instanceName: second, value: 30 },
      { instanceName: compute, value: 72 },
    ]),
    72,
  );
});

test("caps aggregated GPU utilization at 100 percent", () => {
  assert.equal(
    aggregateGpuUtilization([
      {
        instanceName: "pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D",
        value: 70,
      },
      {
        instanceName: "pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D",
        value: 60,
      },
    ]),
    100,
  );
});

test("returns null instead of fake GPU data when Windows counters are unavailable", async () => {
  const result = await readWindowsGpuUtilization(async () => {
    throw new Error("counter missing");
  });
  assert.equal(result.available, false);
  assert.equal(result.percent, null);
  assert.match(result.reason, /did not expose/i);
});
