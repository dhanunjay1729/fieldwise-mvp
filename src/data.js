import { farmers as sampleFarmers, parcels as sampleParcels } from "./model.js";

export const sampleVillage = () => ({
  farmers: sampleFarmers.map(f => ({ ...f, home: [...f.home] })),
  parcels: sampleParcels.map(p => ({ ...p, locked: false }))
});

const finite = (value, label, min, max) => {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return n;
};

export function validateVillage(input) {
  if (!input || !Array.isArray(input.farmers) || !Array.isArray(input.parcels)) {
    throw new Error("The file needs farmers and parcels lists.");
  }
  if (input.farmers.length < 2 || input.farmers.length > 8) {
    throw new Error("Use 2–8 farmers in this pilot editor.");
  }
  if (input.parcels.length < 2 || input.parcels.length > 48) {
    throw new Error("Use 2–48 parcels in this pilot editor.");
  }
  const farmerIds = new Set();
  const farmers = input.farmers.map((raw, i) => {
    const label = `Farmer ${i + 1}`;
    if (!raw || typeof raw !== "object") throw new Error(`${label} must be a farmer record.`);
    const id = String(raw.id ?? "").trim();
    const name = String(raw.name ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(id) || farmerIds.has(id)) throw new Error(`${label} needs a unique short ID.`);
    if (!name || name.length > 60) throw new Error(`${label} needs a name of at most 60 characters.`);
    if (!/^#[0-9a-fA-F]{6}$/.test(raw.color)) throw new Error(`${label} needs a valid colour.`);
    if (!Array.isArray(raw.home) || raw.home.length !== 2) throw new Error(`${label} needs a map home position.`);
    farmerIds.add(id);
    return {
      id, name, color: raw.color,
      home: [finite(raw.home[0], `${name}'s home column`, -2, 13), finite(raw.home[1], `${name}'s home row`, -2, 13)],
      waterWeight: finite(raw.waterWeight, `${name}'s water weight`, 0, 10),
      soilWeight: finite(raw.soilWeight, `${name}'s soil weight`, 0, 10),
      roadWeight: finite(raw.roadWeight, `${name}'s road weight`, 0, 10),
      travelWeight: finite(raw.travelWeight, `${name}'s travel weight`, 0, 10),
      scatterPenalty: finite(raw.scatterPenalty, `${name}'s block penalty`, 0, 20),
      minGain: finite(raw.minGain, `${name}'s minimum gain`, 0, 1000),
      maxPay: finite(raw.maxPay, `${name}'s maximum offer`, 0, 10000),
      askPerAcre: finite(raw.askPerAcre, `${name}'s cash request`, 0, 10000)
    };
  });
  const parcelIds = new Set();
  const cells = new Set();
  const parcels = input.parcels.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`Parcel ${i + 1} must be a parcel record.`);
    const id = String(raw.id ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(id) || parcelIds.has(id)) throw new Error(`Parcel ${i + 1} needs a unique short ID.`);
    parcelIds.add(id);
    const row = finite(raw.row, `${id} row`, 0, 11);
    const col = finite(raw.col, `${id} column`, 0, 11);
    if (!Number.isInteger(row) || !Number.isInteger(col)) throw new Error(`${id} needs whole-number grid coordinates.`);
    const cell = `${row},${col}`;
    if (cells.has(cell)) throw new Error(`Two parcels occupy grid cell ${cell}.`);
    cells.add(cell);
    const owner = String(raw.owner ?? "").trim();
    if (!farmerIds.has(owner)) throw new Error(`${id} has an unknown farmer ID.`);
    const water = finite(raw.water, `${id} water`, 1, 3);
    const soil = finite(raw.soil, `${id} soil`, 1, 3);
    const road = finite(raw.road, `${id} road`, 1, 3);
    if (![water, soil, road].every(Number.isInteger)) throw new Error(`${id} conditions must be whole numbers from 1 to 3.`);
    if (typeof raw.locked !== "boolean") throw new Error(`${id} needs a true or false exchange lock.`);
    return { id, row, col, owner, acres: finite(raw.acres, `${id} acreage`, 0.01, 100), value: finite(raw.value, `${id} value`, 0.01, 10000), water, soil, road, locked: raw.locked };
  });
  return { farmers, parcels };
}
