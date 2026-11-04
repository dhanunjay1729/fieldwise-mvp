# Offline spatial-search benchmark

## What was built

The browser uses `findProposalsExactFast()`. It searches every two- and three-farmer,
one-parcel-per-person cycle, like the original `findProposals()`, but scores only
the participating holdings, caches repeated outgoing/incoming parcel pairs,
keeps only the best eight candidates, and builds full village maps only for
those winners. It is exact **within this limited exchange search space**.

`findProposalsSpatial()` is an experimental alternative for larger input. It
creates a directed offer from farmer A to farmer B only when an unlocked A parcel
shares a grid edge with a B parcel. It retains at most four parcels per directed
farmer pair, ranked by estimated fragmentation and preference improvement. It
enumerates two- and three-farmer cycles in that graph. Every shortlisted cycle
then receives the same exact holding score and cash-settlement checks as the
exact search. The browser editor is capped at eight farmers and 48 parcels;
larger cases remain an offline benchmark, not a full-village browser feature.

## Reproduce

From this directory, run `npm test` and `npm run benchmark`. The scripts use a
fixed random seed. They create four to six adjacent parcels per farmer, then
perform one random owner-pair swap per four parcels and lock roughly 5% of
parcels. The generator is a
synthetic stress case, not a model fitted to an Indian village. All reported
times are the median of three runs on a 13th Gen Intel Core i5-13500H with
Node v20.19.2. Milliseconds vary with hardware and machine load.

| Farmers | Parcels | Original exhaustive | Faster exact | Spatial heuristic | Spatial cycles scored |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 6 | 24 | 148.1 ms | 19.5 ms | 7.1 ms | 298 |
| 8 | 48 | 904.0 ms | 97.1 ms | 14.3 ms | 901 |
| 20 | 100 | not run | not run | 20.8 ms | 1,145 |
| 100 | 500 | not run | not run | 82.4 ms | 2,566 |
| 200 | 1,000 | not run | not run | 135.2 ms | 4,349 |

The faster exact search returned the same ordered proposals as the original
exhaustive search in all 20 small synthetic cases checked. The spatial
heuristic found the same top *score* as exhaustive search in 10/10 cases at
6 farmers and 10/10 at 8 farmers. Of the
eight returned proposals, an average of 6.2 and 7.4 respectively were the
same exact exchanges. The worst overlap was four and five. Equal top scores
in these 20 synthetic cases do not establish that spatial search reliably
finds the best unrestricted exchange.

## Complexity and limits

For the exact search, let `qᵢ` be farmer `i`'s unlocked parcel count and
`C = Σ(i<j) qᵢqⱼ + 2Σ(i<j<k) qᵢqⱼqₖ`. Both exact versions examine all `C`
cycles. The faster version caches each farmer's holding for an outgoing and
incoming parcel pair. If `U` distinct such pairs occur and `q` is the largest
holding size, its main work is `O(C + Uq)` and its cache uses `O(U)` space,
apart from the input and eight returned maps. `U` is at most quadratic in
parcel count. The number of cycles can still grow rapidly, so this does not
make exhaustive search practical for a large village.

Let `P` be parcel count, `F` farmer count, `q` the largest number of parcels
owned by one farmer, `d` the largest number of neighboring farmer holdings,
and `k` the per-directed-pair shortlist cap (four by default). Building the
grid-neighbor graph visits at most four neighboring cells per parcel. Ranking
offers costs up to `O(P q log P)` with the current implementation. Cycle scoring
costs up to `O((F d k² + F d² k³) q)`; exact constants depend on the graph.
If `q` and `d` stay small as village size grows, this scales much better than
enumerating every unrestricted parcel triplet. There is no general linear-time
or optimality guarantee.

The faster exact search is still combinatorial and is not appropriate for
unrestricted village-scale input. The spatial restriction can miss beneficial nonadjacent exchanges, and the
four-parcel cap can discard the best local exchange. The current search returns
individual two- or three-farmer cycles, not one globally coordinated village
redistribution. Its 1–3 water/soil/road ratings, score weights, and cash terms
are unvalidated assumptions. The speed test says nothing about farmer consent,
land-record accuracy, legal feasibility, or how long data collection would take.

## Next technical checkpoint

Benchmark against less convenient parcel layouts and, when legitimately
available, deidentified real parcel geometry. Then test selecting compatible
sets of cycles. Fragmentation changes are not additive, so any combined plan
must be rescored as a whole before it is shown as acceptable to each farmer.
