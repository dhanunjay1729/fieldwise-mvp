import { findProposals, findProposalsExactFast, findProposalsSpatial } from "../src/model.js";
import { syntheticVillage } from "./scalability.js";

function key(proposal) {
  return proposal.changes.map(c => `${c.parcel}:${c.to}`).sort().join("|");
}

const rows = [];
for (const [farmers, parcelsPerFarmer] of [[6, 4], [8, 6]]) {
  for (let sample = 0; sample < 10; sample++) {
    const { people, land } = syntheticVillage(farmers, parcelsPerFarmer, 20261105 + sample);
    const exhaustive = findProposals(people, land, 8);
    const exactFast = findProposalsExactFast(people, land, 8);
    const spatial = findProposalsSpatial(people, land, 8);
    const exactKeys = new Set(exhaustive.map(key));
    rows.push({ farmers, parcels: land.length, sample,
      exactFastSameProposals: JSON.stringify(exhaustive.map(key)) === JSON.stringify(exactFast.map(key)),
      sameBestScore: exhaustive[0]?.blocksSaved === spatial[0]?.blocksSaved &&
        exhaustive[0]?.totalGain === spatial[0]?.totalGain,
      topEightOverlap: spatial.filter(p => exactKeys.has(key(p))).length,
      exactCount: exhaustive.length, spatialCount: spatial.length });
  }
}
for (const farmers of [6, 8]) {
  const group = rows.filter(row => row.farmers === farmers);
  console.log(JSON.stringify({ farmers, samples: group.length,
    exactFastSameProposals: group.filter(row => row.exactFastSameProposals).length,
    sameBestScore: group.filter(row => row.sameBestScore).length,
    meanTopEightOverlap: group.reduce((sum, row) => sum + row.topEightOverlap, 0) / group.length,
    minimumTopEightOverlap: Math.min(...group.map(row => row.topEightOverlap)),
    rows: group }, null, 2));
}
