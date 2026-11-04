import { farmers as defaults, findProposalsExactFast, holding } from "./model.js";
import { sampleVillage, validateVillage } from "./data.js";

const money = value => `₹${Math.abs(value).toFixed(2)}L`;
const signed = (value, unit = "") => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}${unit}`;
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const storageKey = "fieldwise-village-v2";

let { farmers, parcels } = sampleVillage();
let draft = null;
let proposals = [];
let selected = 0;
let mapView = "current";
let selectedParcel = null;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved) ({ farmers, parcels } = validateVillage(saved));
} catch { /* Invalid saved data falls back to the sample village. */ }

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ farmers, parcels })); return true; }
  catch { return false; }
}

function field(label, name, value, min, max, step = "0.1", unit = "₹ lakh") {
  return `<label class="number-field"><span>${label}</span><span class="number-control"><input type="number" inputmode="decimal" data-field="${name}" min="${min}" max="${max}" step="${step}" value="${value}" /><small>${unit}</small></span></label>`;
}

function renderSettings() {
  $("#farmer-settings").innerHTML = farmers.map(f => `
    <section class="farmer-card" data-farmer="${esc(f.id)}">
      <div class="farmer-heading"><span class="farmer-dot" style="--farmer:${f.color}"></span><h3>${esc(f.name)}</h3><span>${holding(f, parcels).acres.toFixed(1)} acres today</span></div>
      ${field("Maximum I would pay", "maxPay", f.maxPay, 0, 100)}
      ${field("Ask for each acre I lose", "askPerAcre", f.askPerAcre, 0, 100)}
      <details><summary>Land priorities</summary><div class="priority-fields">
        ${field("Minimum gain I require", "minGain", f.minGain, 0, 100, "0.1", "score")}
        <label class="number-field"><span>Water importance (score)</span><input type="number" data-field="waterWeight" min="0" max="5" step="0.05" value="${f.waterWeight}" /></label>
        <label class="number-field"><span>Fewer blocks importance (score)</span><input type="number" data-field="scatterPenalty" min="0" max="10" step="0.1" value="${f.scatterPenalty}" /></label>
      </div></details>
    </section>`).join("");
}

function renderLegend() {
  $("#map-legend").innerHTML = farmers.map(f => `<span><i style="background:${f.color}"></i>${esc(f.name)}</span>`).join("");
}

function renderMap() {
  const land = mapView === "proposed" && proposals[selected] ? proposals[selected].land : parcels;
  const cols = Math.max(4, ...land.map(p => p.col + 1));
  const rows = Math.max(3, ...land.map(p => p.row + 1));
  $("#parcel-map").style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  $("#parcel-map").style.gridTemplateRows = `repeat(${rows}, minmax(80px, 1fr))`;
  $("#parcel-map").style.minWidth = cols > 4 ? `${cols * 110}px` : "";
  $("#parcel-map").innerHTML = land.map(p => {
    const farmer = farmers.find(f => f.id === p.owner);
    const changed = mapView === "proposed" && p.owner !== parcels.find(x => x.id === p.id).owner;
    return `<button type="button" class="parcel ${changed ? "changed" : ""} ${selectedParcel === p.id ? "selected" : ""} ${p.locked ? "locked" : ""}" style="--parcel-color:${farmer.color};grid-row:${p.row + 1};grid-column:${p.col + 1}" data-parcel="${esc(p.id)}" aria-label="${esc(p.id)}, ${esc(farmer.name)}, ${p.acres} acres${p.locked ? ", locked from exchange" : ""}"><span>${esc(p.id)} ${p.locked ? "<b title=\"Will not exchange\">⌑</b>" : ""}</span><strong>${esc(farmer.name)}</strong><small>${p.acres.toFixed(1)} ac</small></button>`;
  }).join("");
  if (selectedParcel) {
    const p = land.find(x => x.id === selectedParcel);
    if (!p) { selectedParcel = null; $("#parcel-detail").textContent = "Select a parcel to see its value and farming conditions."; }
    else {
      const owner = farmers.find(f => f.id === p.owner);
      $("#parcel-detail").innerHTML = `<strong>${esc(p.id)} · ${esc(owner.name)}</strong><span>${p.acres.toFixed(1)} acres · ${money(p.value)} estimated plot value · water ${p.water}/3 · soil ${p.soil}/3 · road ${p.road}/3${p.locked ? " · Will not exchange" : ""}</span>`;
    }
  }
  $("#current-view").classList.toggle("active", mapView === "current");
  $("#proposed-view").classList.toggle("active", mapView === "proposed");
  $("#current-view").setAttribute("aria-pressed", String(mapView === "current"));
  $("#proposed-view").setAttribute("aria-pressed", String(mapView === "proposed"));
  $("#proposed-view").disabled = !proposals.length;
}

function renderProposals() {
  $("#results-count").textContent = `${proposals.length} ${proposals.length === 1 ? "option" : "options"} found`;
  $(".results-body").classList.toggle("is-empty", !proposals.length);
  if (!proposals.length) {
    $("#proposal-list").innerHTML = `<div class="empty-state"><strong>No acceptable exchange found with these terms.</strong><p>Try changing a minimum gain or cash offer, or unlocking a plot. Larger multi-plot exchanges are outside this pilot.</p></div>`;
    $("#proposal-detail").innerHTML = "";
    return;
  }
  $("#proposal-list").innerHTML = proposals.map((p, i) => {
    const cash = p.settlement.reduce((sum, row) => sum + row.payment, 0);
    const route = p.participants.map(id => esc(farmers.find(f => f.id === id).name)).join(" → ");
    return `<button type="button" class="proposal-card ${i === selected ? "active" : ""}" data-proposal="${i}" aria-pressed="${i === selected}"><span class="proposal-number">Option ${String(i + 1).padStart(2, "0")}</span><strong>${p.blocksSaved} fewer separate ${p.blocksSaved === 1 ? "block" : "blocks"}</strong><span class="proposal-route">${route}</span><span class="proposal-cash">${money(cash)} exchanged</span></button>`;
  }).join("");
  renderProposalDetail();
}

function renderProposalDetail() {
  const p = proposals[selected];
  if (!p) return;
  const transfers = p.changes.map(c => `<li><span class="transfer-id">${esc(c.parcel)}</span><span>${esc(farmers.find(f => f.id === c.from).name)}</span><span class="transfer-arrow" aria-label="to">→</span><strong>${esc(farmers.find(f => f.id === c.to).name)}</strong></li>`).join("");
  $("#proposal-detail").innerHTML = `<div class="detail-heading"><div><h3>Option ${String(selected + 1).padStart(2, "0")}</h3><p>${p.changes.length} plots change hands across ${p.participants.length} farmers.</p></div><button id="show-map-button" type="button" class="outline-button">Show on map</button></div>
    <div class="transfer-list"><h4>Parcel transfers</h4><ol>${transfers}</ol></div>
    <div class="table-scroll"><table><thead><tr><th>Farmer</th><th>Land</th><th>Separate blocks</th><th>Cash</th><th>Estimated outcome</th></tr></thead><tbody>
    ${p.settlement.map(row => {
      const f = farmers.find(x => x.id === row.id);
      const cash = row.receipt - row.payment;
      return `<tr><th><span class="farmer-dot" style="--farmer:${f.color}"></span>${esc(f.name)}</th><td>${signed(row.acresDelta, " ac")}</td><td>${p.before[f.id].blocks} → ${p.after[f.id].blocks}</td><td>${cash > 0 ? `Receives ${money(cash)}` : cash < 0 ? `Pays ${money(cash)}` : "None"}</td><td class="outcome">+${row.netGain.toFixed(2)} score</td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="score-note">The planning score converts sample plot values and assumed farming benefits to a common scale, then includes cash paid or received. A score point is treated as ₹1 lakh for this demonstration; it is not a validated profit forecast.</p>`;
}

function search() {
  proposals = findProposalsExactFast(farmers, parcels, 8);
  selected = 0;
  mapView = "current";
  renderProposals();
  renderMap();
}

function renderDataCount() {
  $("#data-count").textContent = `${farmers.length} farmers · ${parcels.length} parcels · ${parcels.filter(p => p.locked).length} locked`;
  const blocks = farmers.reduce((sum, farmer) => sum + holding(farmer, parcels).blocks, 0);
  $("#overview-blocks").textContent = `${blocks} separate ${blocks === 1 ? "block" : "blocks"}`;
  $("#overview-meta").textContent = `${farmers.length} farmers across ${parcels.length} plots`;
}

function showDataError(message = "") {
  $("#data-error").textContent = message;
  $("#data-error").hidden = !message;
}

function dataInput(value, field, label, type = "text", extra = "") {
  return `<input type="${type}" data-field="${field}" aria-label="${esc(label)}" value="${esc(value)}" ${extra} />`;
}

function renderEditor() {
  if (!draft) return;
  $("#data-farmers").innerHTML = `<table class="editor-table"><thead><tr><th>ID</th><th>Name</th><th>Home column</th><th>Home row</th><th></th></tr></thead><tbody>${draft.farmers.map(f => `
    <tr data-farmer="${esc(f.id)}"><th>${esc(f.id)}</th><td>${dataInput(f.name, "name", `${f.id} name`)}</td><td>${dataInput(f.home[0], "homeCol", `${f.id} home column`, "number", 'step="0.1"')}</td><td>${dataInput(f.home[1], "homeRow", `${f.id} home row`, "number", 'step="0.1"')}</td><td><button type="button" class="row-button" data-remove-farmer="${esc(f.id)}">Remove</button></td></tr>`).join("")}</tbody></table>`;
  $("#data-parcels").innerHTML = `<table class="editor-table"><thead><tr><th>ID</th><th>Farmer</th><th>Row</th><th>Col</th><th>Acres</th><th>Value ₹L</th><th>Water</th><th>Soil</th><th>Road</th><th>Keep</th><th></th></tr></thead><tbody>${draft.parcels.map(p => `
    <tr data-parcel="${esc(p.id)}"><th>${esc(p.id)}</th><td><select data-field="owner" aria-label="${esc(p.id)} farmer">${draft.farmers.map(f => `<option value="${esc(f.id)}" ${p.owner === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></td><td>${dataInput(p.row, "row", `${p.id} row`, "number", 'min="0" max="11" step="1"')}</td><td>${dataInput(p.col, "col", `${p.id} column`, "number", 'min="0" max="11" step="1"')}</td><td>${dataInput(p.acres, "acres", `${p.id} acres`, "number", 'min="0.01" step="0.01"')}</td><td>${dataInput(p.value, "value", `${p.id} value in lakh rupees`, "number", 'min="0.01" step="0.01"')}</td><td>${dataInput(p.water, "water", `${p.id} water from 1 to 3`, "number", 'min="1" max="3" step="1"')}</td><td>${dataInput(p.soil, "soil", `${p.id} soil from 1 to 3`, "number", 'min="1" max="3" step="1"')}</td><td>${dataInput(p.road, "road", `${p.id} road from 1 to 3`, "number", 'min="1" max="3" step="1"')}</td><td><input type="checkbox" data-field="locked" aria-label="${esc(p.id)} will not exchange" ${p.locked ? "checked" : ""} /></td><td><button type="button" class="row-button" data-remove-parcel="${esc(p.id)}">Remove</button></td></tr>`).join("")}</tbody></table>`;
}

function readEditor() {
  const farmers = [...document.querySelectorAll("#data-farmers tbody tr")].map(row => {
    const id = row.dataset.farmer;
    const base = draft.farmers.find(f => f.id === id);
    return { ...base, name: row.querySelector('[data-field="name"]').value, home: [row.querySelector('[data-field="homeCol"]').value, row.querySelector('[data-field="homeRow"]').value] };
  });
  const parcels = [...document.querySelectorAll("#data-parcels tbody tr")].map(row => {
    const id = row.dataset.parcel;
    const base = draft.parcels.find(p => p.id === id);
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    return { ...base, owner: value("owner"), row: value("row"), col: value("col"), acres: value("acres"), value: value("value"), water: value("water"), soil: value("soil"), road: value("road"), locked: row.querySelector('[data-field="locked"]').checked };
  });
  return { farmers, parcels };
}

function applyVillage(input, message) {
  const valid = validateVillage(input);
  farmers = valid.farmers;
  parcels = valid.parcels;
  draft = structuredClone(valid);
  selectedParcel = null;
  renderSettings();
  renderLegend();
  renderEditor();
  renderDataCount();
  search();
  $("#export-fallback").hidden = true;
  $("#export-text").value = "";
  $("#data-status").textContent = persist() ? message : `${message} Browser storage is unavailable, so export a JSON backup.`;
  showDataError();
}

$("#data-panel").addEventListener("toggle", () => {
  if ($("#data-panel").open) { draft = structuredClone({ farmers, parcels }); renderEditor(); showDataError(); }
});

$("#add-farmer").addEventListener("click", () => {
  draft = readEditor();
  if (draft.farmers.length >= 8) return showDataError("This pilot editor supports at most 8 farmers.");
  let n = 1;
  while (draft.farmers.some(f => f.id === `F${n}`)) n++;
  const template = defaults[0];
  draft.farmers.push({ ...template, id: `F${n}`, name: `Farmer ${n}`, color: ["#8c6ca7", "#ad6660", "#65969b", "#808b47", "#af7f69"][n % 5], home: [0, 0] });
  renderEditor(); showDataError();
});

$("#add-parcel").addEventListener("click", () => {
  draft = readEditor();
  if (draft.parcels.length >= 48) return showDataError("This pilot editor supports at most 48 parcels.");
  const taken = new Set(draft.parcels.map(p => `${p.row},${p.col}`));
  let row = 0, col = 0;
  while (taken.has(`${row},${col}`)) { col++; if (col > 11) { col = 0; row++; } }
  let n = 1;
  while (draft.parcels.some(p => p.id === `P${String(n).padStart(2, "0")}`)) n++;
  draft.parcels.push({ id: `P${String(n).padStart(2, "0")}`, row, col, owner: draft.farmers[0].id, acres: 1, value: 10, water: 2, soil: 2, road: 2, locked: false });
  renderEditor(); showDataError();
});

$("#data-panel").addEventListener("click", event => {
  const removeFarmer = event.target.closest("[data-remove-farmer]");
  const removeParcel = event.target.closest("[data-remove-parcel]");
  if (!removeFarmer && !removeParcel) return;
  draft = readEditor();
  if (removeFarmer) {
    const id = removeFarmer.dataset.removeFarmer;
    if (draft.parcels.some(p => p.owner === id)) return showDataError("Move or remove this farmer's parcels first.");
    draft.farmers = draft.farmers.filter(f => f.id !== id);
  } else draft.parcels = draft.parcels.filter(p => p.id !== removeParcel.dataset.removeParcel);
  renderEditor(); showDataError();
});

$("#save-data").addEventListener("click", () => {
  try { applyVillage(readEditor(), "Village data saved in this browser."); }
  catch (error) { showDataError(error.message); }
});

$("#reset-data").addEventListener("click", () => applyVillage(sampleVillage(), "Sample village restored."));

$("#export-data").addEventListener("click", () => {
  const json = JSON.stringify({ farmers, parcels }, null, 2);
  $("#export-text").value = json;
  $("#export-fallback").hidden = false;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "fieldwise-village.json";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  $("#data-status").textContent = "Backup JSON is ready below. A download was requested; unsaved table edits are not included.";
});

$("#import-data").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100_000) throw new Error("The JSON file is too large for this pilot editor (100 KB maximum).");
    applyVillage(JSON.parse(await file.text()), "Village JSON imported and saved in this browser.");
  } catch (error) { showDataError(error instanceof SyntaxError ? "The selected file is not valid JSON." : error.message); }
  event.target.value = "";
});

$("#farmer-settings").addEventListener("input", event => {
  const input = event.target.closest("input[data-field]");
  if (!input) return;
  const card = input.closest("[data-farmer]");
  const farmer = farmers.find(f => f.id === card.dataset.farmer);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) {
    input.value = farmer[input.dataset.field];
    return;
  }
  farmer[input.dataset.field] = value;
  if (draft) { const draftFarmer = draft.farmers.find(f => f.id === farmer.id); if (draftFarmer) draftFarmer[input.dataset.field] = value; }
  persist();
  search();
});

$("#find-button").addEventListener("click", () => { search(); $("#results-heading").scrollIntoView({ behavior: "smooth" }); });
$("#reset-button").addEventListener("click", () => {
  farmers = farmers.map(f => {
    const sample = defaults.find(d => d.id === f.id) || defaults[0];
    return { ...f, maxPay: sample.maxPay, askPerAcre: sample.askPerAcre, minGain: sample.minGain, waterWeight: sample.waterWeight, soilWeight: sample.soilWeight, roadWeight: sample.roadWeight, travelWeight: sample.travelWeight, scatterPenalty: sample.scatterPenalty };
  });
  if (draft) draft.farmers = farmers.map(f => ({ ...f, home: [...f.home] }));
  persist(); renderSettings(); search();
});
$("#current-view").addEventListener("click", () => { mapView = "current"; renderMap(); });
$("#proposed-view").addEventListener("click", () => { mapView = "proposed"; renderMap(); });
$("#parcel-map").addEventListener("click", event => { const button = event.target.closest("[data-parcel]"); if (button) { selectedParcel = button.dataset.parcel; renderMap(); } });
$("#proposal-list").addEventListener("click", event => { const button = event.target.closest("[data-proposal]"); if (button) { selected = Number(button.dataset.proposal); renderProposals(); renderMap(); } });
$("#proposal-detail").addEventListener("click", event => { if (event.target.closest("#show-map-button")) { mapView = "proposed"; renderMap(); $("#map-heading").scrollIntoView({ behavior: "smooth" }); } });

renderSettings();
renderLegend();
renderDataCount();
search();
