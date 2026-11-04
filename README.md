# Fieldwise MVP

A local planner for voluntary farmland exchanges. It finds two- and three-farmer parcel cycles, scores farming conditions and compactness, and suggests cash settlement within each farmer's entered limits.

The site is static: its HTML, CSS, and JavaScript can be published directly from the repository root with GitHub Pages. Village edits stay in the visitor's browser; there is no server-side account or shared database.

[Preview the planning interface](preview.png).

## Run

```bash
npm start
```

Open `http://localhost:4173`. No package installation or backend is needed. Run `npm test` for the solver checks.

## Edit a pilot village

Open **Edit farmers and parcels** beneath the map. You can rename farmers, change their schematic home positions, add or remove farmers and plots, edit acreage, estimated value and 1–3 condition ratings, and mark a parcel **Keep**. A kept parcel will never be offered in an exchange. Select **Save village data** to validate and apply edits. Farmer offer terms in the side panel update immediately.

Saved data stays in this browser's local storage. **Export JSON** requests a download and also shows copyable backup text; **Import JSON** restores a file. Export after saving, because unsaved table edits are not included. **Restore sample village** replaces local pilot data with the original example.

This editor is limited to 2–8 farmers and 2–48 parcels on a 12×12 schematic grid. It is for a small pilot subset, not for a full village or surveyed cadastral geometry.

## What the demonstration assumes

- The sample parcels are schematic. Map squares show adjacency, not exact area, location, title or boundaries. Edited row and column coordinates remain schematic.
- Plot values are illustrative lakh-rupee figures. Water, soil and road inputs use a simple 1–3 scale.
- An outcome score combines plot value and editable preferences with travel and fragmentation penalties. The prototype treats one score point as ₹1 lakh when finding cash settlements. These conversion weights are assumptions, **not validated economic valuations**.
- Each candidate passes one unlocked whole parcel per farmer around a cycle. It cannot subdivide parcels, search larger groups, or add outside funding.
- Cash requests are minimum receipts per acre lost, and maximum offers cap what a farmer may pay. A proposal appears only when all participants meet their stated minimum gain and total payments equal total receipts.
- This MVP does not verify land records, negotiate legal agreements, transfer title, or process payments. A real pilot needs one state's legal process, checked parcel records, local valuation, consent and field validation.

## Offline scalability experiment

The browser uses a faster exact search for all two- and three-farmer, one-parcel-per-person cycles within its small editable pilot subset. Run `npm run benchmark` to compare it with the original exhaustive implementation and an experimental spatial shortlist search for larger inputs. See [BENCHMARK.md](BENCHMARK.md) for measured times, quality checks, and limitations. The benchmark uses generated villages; it does not establish real-world acceptance or legal feasibility.
