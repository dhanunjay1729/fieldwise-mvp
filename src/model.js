export const farmers = [
  { id: "A", name: "Asha", color: "#3d7465", home: [-1, 1], waterWeight: 0.35, soilWeight: 0.25, roadWeight: 0.2, travelWeight: 0.45, scatterPenalty: 1.8, minGain: 0.1, maxPay: 2.5, askPerAcre: 0.6 },
  { id: "B", name: "Bharat", color: "#bb8a40", home: [1.5, -1], waterWeight: 0.5, soilWeight: 0.2, roadWeight: 0.25, travelWeight: 0.4, scatterPenalty: 1.8, minGain: 0.1, maxPay: 2.5, askPerAcre: 0.6 },
  { id: "C", name: "Chitra", color: "#637cb0", home: [4, 1], waterWeight: 0.3, soilWeight: 0.35, roadWeight: 0.2, travelWeight: 0.45, scatterPenalty: 1.8, minGain: 0.1, maxPay: 2.5, askPerAcre: 0.6 }
];

// Schematic parcels. Cell size indicates adjacency; acreage is a separate field.
export const parcels = [
  { id: "P01", row: 0, col: 0, owner: "A", acres: 1.0, value: 11.0, water: 2, soil: 3, road: 2 },
  { id: "P02", row: 0, col: 1, owner: "B", acres: 0.9, value: 10.0, water: 2, soil: 2, road: 3 },
  { id: "P03", row: 0, col: 2, owner: "B", acres: 1.1, value: 12.0, water: 3, soil: 2, road: 2 },
  { id: "P04", row: 0, col: 3, owner: "C", acres: 0.8, value: 9.0, water: 1, soil: 2, road: 3 },
  { id: "P05", row: 1, col: 0, owner: "A", acres: 1.2, value: 12.0, water: 3, soil: 3, road: 2 },
  { id: "P06", row: 1, col: 1, owner: "C", acres: 0.9, value: 10.5, water: 2, soil: 3, road: 1 },
  { id: "P07", row: 1, col: 2, owner: "B", acres: 1.0, value: 10.5, water: 2, soil: 2, road: 1 },
  { id: "P08", row: 1, col: 3, owner: "C", acres: 1.1, value: 12.0, water: 3, soil: 2, road: 2 },
  { id: "P09", row: 2, col: 0, owner: "A", acres: 1.0, value: 10.0, water: 2, soil: 2, road: 1 },
  { id: "P10", row: 2, col: 1, owner: "C", acres: 1.1, value: 11.0, water: 2, soil: 3, road: 1 },
  { id: "P11", row: 2, col: 2, owner: "A", acres: 0.9, value: 10.0, water: 2, soil: 2, road: 1 },
  { id: "P12", row: 2, col: 3, owner: "B", acres: 1.0, value: 10.0, water: 2, soil: 2, road: 1 }
];

const round = n => Math.round(n * 100) / 100;

export function components(owned) {
  const cells = new Set(owned.map(p => `${p.row},${p.col}`));
  let count = 0;
  while (cells.size) {
    count++;
    const stack = [cells.values().next().value];
    cells.delete(stack[0]);
    while (stack.length) {
      const [row, col] = stack.pop().split(",").map(Number);
      for (const key of [`${row - 1},${col}`, `${row + 1},${col}`, `${row},${col - 1}`, `${row},${col + 1}`]) {
        if (cells.delete(key)) stack.push(key);
      }
    }
  }
  return count;
}

function holdingOwned(farmer, owned) {
  const acres = owned.reduce((sum, p) => sum + p.acres, 0);
  const marketValue = owned.reduce((sum, p) => sum + p.value, 0);
  const blocks = components(owned);
  const utility = owned.reduce((sum, p) => sum + p.value +
    farmer.waterWeight * p.water + farmer.soilWeight * p.soil + farmer.roadWeight * p.road -
    farmer.travelWeight * (Math.abs(p.col - farmer.home[0]) + Math.abs(p.row - farmer.home[1])), 0) -
    farmer.scatterPenalty * Math.max(0, blocks - 1);
  return { acres: round(acres), marketValue: round(marketValue), blocks, utility: round(utility) };
}

export function holding(farmer, allParcels) {
  return holdingOwned(farmer, allParcels.filter(p => p.owner === farmer.id));
}

function settle(farmersInCycle, before, after) {
  const rows = farmersInCycle.map(farmer => {
    const old = before[farmer.id];
    const next = after[farmer.id];
    const grossGain = round(next.utility - old.utility);
    const acresDelta = round(next.acres - old.acres);
    const request = Math.max(0, farmer.minGain - grossGain, -acresDelta * farmer.askPerAcre);
    const capacity = request > 0 ? 0 : Math.min(farmer.maxPay, Math.max(0, grossGain - farmer.minGain));
    return { id: farmer.id, grossGain, acresDelta, request: round(request), capacity: round(capacity) };
  });
  const totalRequest = round(rows.reduce((sum, row) => sum + row.request, 0));
  const totalCapacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  if (totalCapacity + 0.00001 < totalRequest) return null;
  let remaining = totalRequest;
  for (const row of rows) {
    row.payment = Math.min(row.capacity, remaining);
    remaining = round(remaining - row.payment);
    row.receipt = row.request;
    row.netGain = round(row.grossGain + row.receipt - row.payment);
  }
  if (rows.some(row => row.netGain < -0.00001)) return null;
  return rows;
}

export function findProposals(people = farmers, land = parcels, limit = 8) {
  const before = Object.fromEntries(people.map(f => [f.id, holding(f, land)]));
  const candidates = [];
  const seen = new Set();
  // A cycle sends one parcel from each participant to the next participant.
  for (let size = 2; size <= Math.min(3, people.length); size++) {
    const orders = size === 2
      ? people.flatMap((a, i) => people.slice(i + 1).map(b => [a, b]))
      : people.flatMap((a, i) => people.slice(i + 1).flatMap((b, j) => people.slice(i + j + 2).flatMap(c => [[a, b, c], [a, c, b]])));
    for (const order of orders) {
      const choices = order.map(f => land.filter(p => p.owner === f.id && !p.locked));
      const visit = (index, picked) => {
        if (index < choices.length) {
          for (const parcel of choices[index]) visit(index + 1, [...picked, parcel]);
          return;
        }
        const changes = picked.map((parcel, i) => ({ parcel: parcel.id, from: order[i].id, to: order[(i + 1) % size].id }));
        const key = changes.map(c => `${c.parcel}:${c.to}`).sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        const nextLand = land.map(p => {
          const change = changes.find(c => c.parcel === p.id);
          return change ? { ...p, owner: change.to } : p;
        });
        const after = Object.fromEntries(order.map(f => [f.id, holding(f, nextLand)]));
        const settlement = settle(order, before, after);
        if (!settlement) return;
        const blocksSaved = order.reduce((sum, f) => sum + before[f.id].blocks - after[f.id].blocks, 0);
        if (blocksSaved <= 0) return;
        const totalGain = round(settlement.reduce((sum, row) => sum + row.netGain, 0));
        candidates.push({ changes, before, after, settlement, blocksSaved, totalGain, land: nextLand, participants: order.map(f => f.id) });
      };
      visit(0, []);
    }
  }
  candidates.sort((a, b) => b.blocksSaved - a.blocksSaved || b.totalGain - a.totalGain);
  return candidates.slice(0, limit);
}

function cycleCollector(people, land, owned, before, limit) {
  const best = [];
  const holdingCache = people.map(() => new Map());
  let evaluated = 0;
  let acceptable = 0;
  let holdingComputations = 0;
  const compare = (a, b) => b.blocksSaved - a.blocksSaved || b.totalGain - a.totalGain;
  const evaluate = (order, picked) => {
    evaluated++;
    const after = {};
    for (let i = 0; i < order.length; i++) {
      const owner = order[i];
      const incoming = picked[(i + order.length - 1) % order.length];
      const cacheKey = `${picked[i].id}\0${incoming.id}`;
      let nextHolding = holdingCache[owner].get(cacheKey);
      if (!nextHolding) {
        const remaining = owned[owner].filter(p => p.id !== picked[i].id);
        nextHolding = holdingOwned(people[owner], [...remaining, { ...incoming, owner: people[owner].id }]);
        holdingCache[owner].set(cacheKey, nextHolding);
        holdingComputations++;
      }
      after[people[owner].id] = nextHolding;
    }
    const participants = order.map(i => people[i]);
    const settlement = settle(participants, before, after);
    if (!settlement) return;
    const blocksSaved = order.reduce((sum, i) => sum + before[people[i].id].blocks - after[people[i].id].blocks, 0);
    if (blocksSaved <= 0) return;
    acceptable++;
    if (!limit) return;
    const totalGain = round(settlement.reduce((sum, row) => sum + row.netGain, 0));
    const changes = picked.map((p, i) => ({ parcel: p.id, from: people[order[i]].id, to: people[order[(i + 1) % order.length]].id }));
    const candidate = { changes, before, after, settlement, blocksSaved, totalGain, participants: participants.map(f => f.id) };
    if (best.length === limit && compare(candidate, best[best.length - 1]) >= 0) return;
    best.push(candidate);
    best.sort(compare);
    if (best.length > limit) best.pop();
  };
  const results = () => best.map(candidate => {
    const transfers = new Map(candidate.changes.map(c => [c.parcel, c.to]));
    return { ...candidate, land: land.map(p => transfers.has(p.id) ? { ...p, owner: transfers.get(p.id) } : p) };
  });
  return { evaluate, results, counts: () => ({ evaluated, acceptable, holdingComputations }) };
}

// Exact within the MVP's two- and three-farmer, one-parcel-per-person search
// space. It scores only the participants and builds full maps for the winners.
export function findProposalsExactFast(people = farmers, land = parcels, limit = 8, options = {}) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("limit must be a nonnegative integer");
  const index = new Map(people.map((f, i) => [f.id, i]));
  const owned = people.map(() => []);
  for (const parcel of land) {
    const i = index.get(parcel.owner);
    if (i === undefined) throw new Error(`Unknown owner: ${parcel.owner}`);
    owned[i].push(parcel);
  }
  const before = Object.fromEntries(people.map((f, i) => [f.id, holdingOwned(f, owned[i])]));
  const available = owned.map(list => list.filter(p => !p.locked));
  const collector = cycleCollector(people, land, owned, before, limit);
  for (let a = 0; a < people.length; a++) {
    for (let b = a + 1; b < people.length; b++) {
      for (const pa of available[a]) for (const pb of available[b]) collector.evaluate([a, b], [pa, pb]);
    }
  }
  for (let a = 0; a < people.length; a++) {
    for (let b = a + 1; b < people.length; b++) {
      for (let c = b + 1; c < people.length; c++) {
        for (const order of [[a, b, c], [a, c, b]]) {
          for (const pa of available[order[0]]) for (const pb of available[order[1]]) {
            for (const pc of available[order[2]]) collector.evaluate(order, [pa, pb, pc]);
          }
        }
      }
    }
  }
  if (options.stats) Object.assign(options.stats, collector.counts());
  return collector.results();
}

// A bounded, local search for larger schematic villages. Only parcels touching
// another farmer's holding can be offered to that farmer. This is a heuristic:
// the best unrestricted exchange may lie outside this candidate graph.
export function findProposalsSpatial(people = farmers, land = parcels, limit = 8, options = {}) {
  const { maxParcelsPerEdge = 4, stats } = options;
  if (!Number.isInteger(maxParcelsPerEdge) || maxParcelsPerEdge < 1) {
    throw new Error("maxParcelsPerEdge must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 0) throw new Error("limit must be a nonnegative integer");
  const index = new Map(people.map((f, i) => [f.id, i]));
  const owned = people.map(() => []);
  const cells = new Map();
  for (const parcel of land) {
    const i = index.get(parcel.owner);
    if (i === undefined) throw new Error(`Unknown owner: ${parcel.owner}`);
    owned[i].push(parcel);
    cells.set(`${parcel.row},${parcel.col}`, parcel);
  }
  const before = Object.fromEntries(people.map((f, i) => [f.id, holdingOwned(f, owned[i])]));
  const edges = people.map(() => new Map());
  let localOffers = 0;
  for (const parcel of land) {
    if (parcel.locked) continue;
    const from = index.get(parcel.owner);
    const recipients = new Set();
    for (const key of [`${parcel.row - 1},${parcel.col}`, `${parcel.row + 1},${parcel.col}`, `${parcel.row},${parcel.col - 1}`, `${parcel.row},${parcel.col + 1}`]) {
      const neighbor = cells.get(key);
      if (neighbor && neighbor.owner !== parcel.owner) recipients.add(index.get(neighbor.owner));
    }
    for (const to of recipients) {
      if (!edges[from].has(to)) edges[from].set(to, []);
      edges[from].get(to).push(parcel);
      localOffers++;
    }
  }
  const scoreOffer = (parcel, from, to) => {
    const oldFromBlocks = before[people[from].id].blocks;
    const oldToBlocks = before[people[to].id].blocks;
    const newFromBlocks = components(owned[from].filter(p => p.id !== parcel.id));
    const newToBlocks = components([...owned[to], parcel]);
    const recipient = people[to];
    const donor = people[from];
    const contribution = farmer => farmer.waterWeight * parcel.water + farmer.soilWeight * parcel.soil +
      farmer.roadWeight * parcel.road - farmer.travelWeight *
      (Math.abs(parcel.col - farmer.home[0]) + Math.abs(parcel.row - farmer.home[1]));
    return (oldFromBlocks - newFromBlocks) * donor.scatterPenalty +
      (oldToBlocks - newToBlocks) * recipient.scatterPenalty + contribution(recipient) - contribution(donor);
  };
  let shortlistedOffers = 0;
  for (let from = 0; from < people.length; from++) {
    for (const [to, offers] of edges[from]) {
      offers.sort((a, b) => scoreOffer(b, from, to) - scoreOffer(a, from, to) || a.id.localeCompare(b.id));
      edges[from].set(to, offers.slice(0, maxParcelsPerEdge));
      shortlistedOffers += Math.min(offers.length, maxParcelsPerEdge);
    }
  }
  const collector = cycleCollector(people, land, owned, before, limit);
  for (let a = 0; a < people.length; a++) {
    for (const [b, ab] of edges[a]) {
      if (b > a && edges[b].has(a)) {
        for (const pa of ab) for (const pb of edges[b].get(a)) collector.evaluate([a, b], [pa, pb]);
      }
      if (b <= a) continue;
      for (const [c, bc] of edges[b]) {
        if (c <= a || c === b || !edges[c].has(a)) continue;
        for (const pa of ab) for (const pb of bc) for (const pc of edges[c].get(a)) {
          collector.evaluate([a, b, c], [pa, pb, pc]);
        }
      }
    }
  }
  // The a->b->c loop above starts at the lowest-index participant. The
  // second orientation is included when b and c are visited in reverse order.
  if (stats) Object.assign(stats, { localOffers, shortlistedOffers, ...collector.counts() });
  return collector.results();
}
