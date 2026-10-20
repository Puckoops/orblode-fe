import { test } from "node:test";
import assert from "node:assert/strict";
import { everyTargetHasLogs, gnssTargets, isGnssLog, matchTarget } from "../gnssMatch.ts";

const session = (point_id: string, role = "gcp") => ({ point_id, role, files: [] as { id: string; name: string; size: number; uploaded: boolean }[], antenna_height_m: 1.8 });

const job = {
  reference: { kind: "cors" as const, name: "SoI CORS Bhubaneswar", files: [], lat: 20.3, lon: 85.8, h_ellipsoid: -40, antenna_height_m: 0 },
  base: session("BASE", "base"),
  rovers: [session("G1"), session("G2"), session("G10"), session("C1", "check")],
};

test("logs are told from processed outputs by their extension", () => {
  for (const name of ["G1.ubx", "base.26o", "cors_0312.obs", "BHUB0710.26n", "G2.rnx", "ref.crx", "G1.26o.gz"]) assert.ok(isGnssLog(name), name);
  for (const name of ["dtm.tif", "cloud.laz", "boundary.zip", "lines.dxf"]) assert.ok(!isGnssLog(name), name);
});

test("a rover's log is matched by its point id however the crew wrote it", () => {
  assert.equal(matchTarget("G1_0312.ubx", job), "rover:G1");
  assert.equal(matchTarget("g01.26o", job), "rover:G1");
  assert.equal(matchTarget("GCP-2 morning.ubx", job), "rover:G2");
  assert.equal(matchTarget("gcp10.ubx", job), "rover:G10");
  assert.equal(matchTarget("CP1.ubx", job), "rover:C1");
});

test("G1 is not G10", () => {
  assert.equal(matchTarget("G10.ubx", job), "rover:G10");
  assert.equal(matchTarget("G100.ubx", job), null);
});

test("the base and the reference station are matched by name", () => {
  assert.equal(matchTarget("Base_station.ubx", job), "base");
  assert.equal(matchTarget("CORS_2026_0312.26o", job), "reference");
  assert.equal(matchTarget("ref.26n", job), "reference");
  assert.equal(matchTarget("soi cors bhubaneswar day71.obs", job), "reference");
});

test("a log that names nothing is left for the person to place", () => {
  assert.equal(matchTarget("log_0001.ubx", job), null);
});

test("the targets list the reference, the base and each rover", () => {
  assert.deepEqual(
    gnssTargets(job).map((t) => t.target),
    ["reference", "base", "rover:G1", "rover:G2", "rover:G10", "rover:C1"],
  );
});

test("the job is ready once every target has a log, counting uploaded ones", () => {
  const all = ["reference", "base", "rover:G1", "rover:G2", "rover:G10", "rover:C1"];
  assert.ok(everyTargetHasLogs(job, all));
  assert.ok(!everyTargetHasLogs(job, all.slice(0, -1)));
  const uploaded = { ...job, rovers: job.rovers.map((r) => ({ ...r, files: r.point_id === "C1" ? [{ id: "f", name: "c1.ubx", size: 1, uploaded: true }] : [] })) };
  assert.ok(everyTargetHasLogs(uploaded, all.slice(0, -1)));
});
