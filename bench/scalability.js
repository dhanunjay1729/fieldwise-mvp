import { performance } from "node:perf_hooks";
import { cpus } from "node:os";
import { findProposals, findProposalsExactFast, findProposalsSpatial } from "../src/model.js";

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function syntheticVillage(farmerCount, parcelsPerFarmer = 5, seed = 20261105) {
  const draw = random(seed);
  const parcelCount = farmerCount * parcelsPerFarmer;
  const width = Math.ceil(Math.sqrt(parcelCount));
  const owners = Array.from({ length: parcelCount }, (_, i) => Math.floor(i / parcelsPerFarmer));
  // Start with adjacent holdings, then exchange 25% of cells to create fragmentation.
  for (let i = 0; i < Math.floor(parcelCount / 4); i++) {
    const a = Math.floor(draw() * parcelCount);
    const b = Math.floor(draw() * parcelCount);
    [owners[a], owners[b]] = [owners[b], owners[a]];
  }
  const people = Array.from({ length: farmerCount }, (_, i) => {
    const homeCell = i * parcelsPerFarmer + Math.floor(parcelsPerFarmer / 2);
    return {
      id: `F${String(i + 1).padStart(3, "0")}`, home: [homeCell % width, Math.floor(homeCell / width)],
      waterWeight: 0.3 + 0.2 * draw(), soilWeight: 0.2 + 0.2 * draw(),
      roadWeight: 0.15 + 0.15 * draw(), travelWeight: 0.25 + 0.2 * draw(),
      scatterPenalty: 1.8, minGain: 0.1, maxPay: 2.5, askPerAcre: 0.6
    };
  });
  const land = owners.map((owner, i) => ({
    id: `P${String(i + 1).padStart(4, "0")}`, row: Math.floor(i / width), col: i % width,
    owner: people[owner].id, acres: 0.8 + Math.floor(draw() * 5) / 10,
    value: 9 + Math.floor(draw() * 9) / 2,
    water: 1 + Math.floor(draw() * 3), soil: 1 + Math.floor(draw() * 3),
    road: 1 + Math.floor(draw() * 3), locked: draw() < 0.05
  }));
  return { people, land };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function run(fn, repeats) {
  const times = [];
  let result;
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    result = fn();
    times.push(performance.now() - start);
  }
  return { ms: Math.round(median(times) * 10) / 10, result };
}

function quality(proposals) {
  return proposals[0] ? { blocksSaved: proposals[0].blocksSaved, totalGain: proposals[0].totalGain } : null;
}

function compareSmall(farmerCount, parcelsPerFarmer) {
  const { people, land } = syntheticVillage(farmerCount, parcelsPerFarmer);
  const old = run(() => findProposals(people, land, 8), 3);
  const exactFast = run(() => findProposalsExactFast(people, land, 8), 3);
  const stats = {};
  const local = run(() => findProposalsSpatial(people, land, 8, { stats }), 3);
  const oldKeys = new Set(old.result.map(p => p.changes.map(c => `${c.parcel}:${c.to}`).sort().join("|")));
  return {
    farmers: farmerCount, parcels: land.length, exhaustiveMs: old.ms,
    exactFastMs: exactFast.ms, spatialMs: local.ms,
    exhaustiveBest: quality(old.result), exactFastBest: quality(exactFast.result), spatialBest: quality(local.result),
    topEightOverlap: local.result.filter(p => oldKeys.has(p.changes.map(c => `${c.parcel}:${c.to}`).sort().join("|"))).length,
    ...stats
  };
}

function compareLarge(farmerCount, parcelsPerFarmer) {
  const { people, land } = syntheticVillage(farmerCount, parcelsPerFarmer);
  const stats = {};
  const local = run(() => findProposalsSpatial(people, land, 8, { stats }), 3);
  return {
    farmers: farmerCount, parcels: land.length, spatialMs: local.ms,
    spatialBest: quality(local.result), ...stats
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const rows = [compareSmall(6, 4), compareSmall(8, 6), compareLarge(20, 5),
    compareLarge(100, 5), compareLarge(200, 5)];
  console.log(JSON.stringify({ cpu: cpus()[0].model, node: process.version,
    scenario: "Synthetic adjacent starting holdings, one random owner-pair swap per four parcels, about 5% locked",
    repetitions: 3, rows }, null, 2));
}
