import test from "node:test";
import assert from "node:assert/strict";
import { components, farmers, parcels, findProposals, findProposalsExactFast, findProposalsSpatial, holding } from "../src/model.js";
import { sampleVillage, validateVillage } from "../src/data.js";
import { syntheticVillage } from "../bench/scalability.js";

test("connected cells are counted as a single holding block", () => {
  assert.equal(components([{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 2 }]), 2);
});

test("every proposed cycle preserves parcels and balances cash", () => {
  const proposals = findProposals(farmers, parcels, 50);
  assert.ok(proposals.length > 0);
  assert.ok(proposals.some(p => p.settlement.some(row => row.payment > 0)));
  for (const proposal of proposals) {
    assert.deepEqual(proposal.land.map(p => p.id).sort(), parcels.map(p => p.id).sort());
    assert.ok(proposal.blocksSaved > 0);
    const paid = proposal.settlement.reduce((sum, row) => sum + row.payment, 0);
    const received = proposal.settlement.reduce((sum, row) => sum + row.receipt, 0);
    assert.ok(Math.abs(paid - received) < 0.01);
    for (const row of proposal.settlement) {
      const farmer = farmers.find(f => f.id === row.id);
      assert.ok(row.netGain + 0.001 >= farmer.minGain);
      assert.ok(row.payment <= farmer.maxPay);
      assert.ok(row.receipt + 0.001 >= Math.max(0, -row.acresDelta * farmer.askPerAcre));
    }
  }
});

test("a farmer can refuse any outcome by raising the minimum gain", () => {
  const strict = farmers.map(f => ({ ...f, minGain: 100 }));
  assert.deepEqual(findProposals(strict, parcels), []);
});

test("locked parcels never move, even when they would appear in a good exchange", () => {
  const baseline = findProposals(farmers, parcels, 20);
  assert.ok(baseline.some(p => p.changes.some(c => c.parcel === "P11")));
  const locked = parcels.map(p => ({ ...p, locked: p.id === "P11" }));
  assert.ok(findProposals(farmers, locked, 20).every(p => p.changes.every(c => c.parcel !== "P11")));
  assert.deepEqual(findProposals(farmers, locked.map(p => ({ ...p, locked: true }))), []);
});

test("village input validates IDs, owners, positions, and persisted locks", () => {
  const village = sampleVillage();
  village.parcels[0].locked = true;
  assert.equal(validateVillage(JSON.parse(JSON.stringify(village))).parcels[0].locked, true);
  village.parcels[1].row = village.parcels[0].row;
  village.parcels[1].col = village.parcels[0].col;
  assert.throws(() => validateVillage(village), /Two parcels occupy/);
  village.parcels[1].col = 1;
  village.parcels[1].owner = "missing";
  assert.throws(() => validateVillage(village), /unknown farmer/);
});

test("spatial shortlist keeps the sample's best scores and reports its search size", () => {
  const stats = {};
  const exhaustive = findProposals(farmers, parcels, 8);
  const spatial = findProposalsSpatial(farmers, parcels, 8, { stats });
  assert.deepEqual(spatial.map(p => [p.blocksSaved, p.totalGain]), exhaustive.map(p => [p.blocksSaved, p.totalGain]));
  assert.ok(stats.evaluated > 0 && stats.evaluated < 176);
  assert.ok(stats.acceptable >= spatial.length);
});

test("faster exact search returns the same proposals as the original exhaustive search", () => {
  for (const village of [
    { people: farmers, land: parcels },
    syntheticVillage(6, 4, 20261105),
    syntheticVillage(8, 6, 20261106)
  ]) {
    const stats = {};
    assert.deepEqual(findProposalsExactFast(village.people, village.land, 8, { stats }),
      findProposals(village.people, village.land, 8));
    assert.ok(stats.evaluated > 0);
    assert.ok(stats.acceptable >= 0);
  }
});

test("spatial proposals obey locks, exact holding scores, minimum gains, and balanced cash", () => {
  const land = parcels.map(p => ({ ...p, locked: p.id === "P11" }));
  const stats = {};
  const proposals = findProposalsSpatial(farmers, land, 20, { maxParcelsPerEdge: 2, stats });
  assert.ok(proposals.length > 0);
  assert.ok(stats.shortlistedOffers <= stats.localOffers);
  for (const proposal of proposals) {
    assert.ok(proposal.changes.every(change => change.parcel !== "P11"));
    assert.deepEqual(proposal.land.map(p => p.id), land.map(p => p.id));
    assert.equal(proposal.land.length, land.length);
    assert.ok(proposal.blocksSaved > 0);
    const payments = proposal.settlement.reduce((sum, row) => sum + row.payment, 0);
    const receipts = proposal.settlement.reduce((sum, row) => sum + row.receipt, 0);
    assert.ok(Math.abs(payments - receipts) < 0.01);
    for (const row of proposal.settlement) {
      const farmer = farmers.find(f => f.id === row.id);
      assert.deepEqual(proposal.after[row.id], holding(farmer, proposal.land));
      assert.ok(row.netGain + 0.001 >= farmer.minGain);
      assert.ok(row.payment <= farmer.maxPay);
      assert.ok(row.receipt + 0.001 >= Math.max(0, -row.acresDelta * farmer.askPerAcre));
    }
  }
  assert.deepEqual(findProposalsSpatial(farmers, land.map(p => ({ ...p, locked: true }))), []);
  assert.deepEqual(findProposalsSpatial(farmers.map(f => ({ ...f, minGain: 100 })), land), []);
  assert.throws(() => findProposalsSpatial(farmers, land, 8, { maxParcelsPerEdge: 0 }), /positive integer/);
});
