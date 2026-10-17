# GNT Circle — Scenario Specification

> Status: **DRAFT – pending validation**. Derived from the whiteboard sketch.
> Scenario ID: `gnt_circle`. Read this spec before writing SUMO XML or backend/frontend code.
> Items marked **[ASSUMPTION]** are my reading of the sketch. Items marked **[OPEN-x]** need confirmation (see §11).

---

## 1. Summary

GNT Circle is an **unsignalised** junction with:
- A **clockwise roundabout** (the "GNT Circle") on the main NG ⇄ TL corridor.
- A **divided two-way stem** running south from the roundabout to a lower east–west road.
- A **free-left slip** from TL down to the lower road (towards FL), bypassing the roundabout.
- A lower **divided road** leading west to/from the Flyover (FL), with a **median U-turn opening**.

There are **no traffic signals** anywhere. All conflicts are resolved by priority rules (§6).

### 1.1 Traffic convention
- **Left-hand traffic (India)**. Vehicles keep left; roundabout circulation is **clockwise**.
- SUMO: build with `netconvert --lefthand true` (or `<processing><lefthand value="true"/>`).

### 1.2 Terminal (arm) names
Compass directions are **not used**. Arms are named by destination/origin:

| Code | Name | Where on the sketch |
| :--- | :--- | :--- |
| `NG` | Nallagandla | Left (west) end of the top main road |
| `TL` | Tellapur | Right (east) end of the top main road |
| `FL` | Flyover | Left (west) end of the bottom road |

Direction suffixes used in IDs: `_in` = traffic entering the model from that arm, `_out` = leaving to that arm.

---

## 2. Layout Overview (schematic)

```text
  NG_in  ══▶══════╮   ╭─────╮   ╭══════════════▶══  TL_out
                  ╰──▶│ GNT │──▶╯
  NG_out ══◀══════╮   │Circle│  ╭══════════════◀══  TL_in
                  ╰──◀│(cw) │◀─╯ │
                      ╰┬───┬╯    │  free-left slip (TL → FL)
                 stem ▲│   │▼    │
                  NB  ││   ││ SB │
                       │   │     │
  FL_in  ══▶═══════════╯   │     │
  ─ ─ ─ ─ ─ U ─ ─ ─ ─ ─ ─ ─│─ ─ ─│─   (median, U-turn gap at "U")
  FL_out ══◀═══════════════╧═════╯
```

- Top road: **main corridor NG ⇄ TL**, divided by a raised median.
- Roundabout: sits on the main corridor; its northern arc bulges above the road.
- Stem: two-way divided link from roundabout's south side down to the bottom road.
- Bottom road: divided, eastbound upper carriageway feeds the stem NB; westbound lower carriageway collects stem SB + TL slip and runs to FL.

---

## 3. Coordinate System & Geometry

Same conventions as other scenarios: metres, X → right, Y → up (sketch top = +Y). Origin at roundabout centre.

| Element | Proposed value | Notes |
| :--- | :--- | :--- |
| Roundabout centre | (0, 0) | Node cluster `gnt_rb_*` |
| Central island radius | 20 m | [ASSUMPTION] |
| Circulating carriageway | 2 lanes, 7.0 m wide | [OPEN-1] sketch shows ~2 lanes |
| Outer radius | ~27 m | |
| Main road (NG arm) length | 300 m (X: −330 → −30) | [ASSUMPTION] |
| Main road (TL arm) length | 300 m (X: +30 → +330) | [ASSUMPTION] |
| Main road carriageway | 3 lanes / direction, 3.2 m | [OPEN-2] sketch dashes suggest 2–3 |
| Main road median | 2.0 m raised | hatched in sketch |
| Stem length | 150 m (Y: −27 → −177) | [ASSUMPTION] |
| Stem carriageway | 2 lanes / direction, 3.2 m, median 1.5 m | |
| TL slip | 1–2 lanes, joins bottom road at X≈+60 | Left of stem, curve radius ~15 m |
| Bottom road length | 400 m (X: −340 → +60), Y ≈ −190 | |
| Bottom road carriageway | 3 lanes / direction | [OPEN-2] |
| U-turn gap | X ≈ −250 m, gap width 12 m | Westbound → eastbound only |
| Speed limit (main/bottom) | 50 km/h (13.89 m/s) | urban [OPEN-3] |
| Speed limit (roundabout) | 25 km/h (6.94 m/s) | |
| Speed limit (slip, U-turn) | 20 km/h (5.56 m/s) | |

---

## 4. Network Elements (SUMO IDs)

### 4.1 Nodes (`gnt_circle.nod.xml`)
| ID | Type | Description |
| :--- | :--- | :--- |
| `NG_end` | `dead_end` | West terminal of main road |
| `TL_end` | `dead_end` | East terminal of main road |
| `FL_end` | `dead_end` | West terminal of bottom road |
| `rb_W` | `priority` | Roundabout west node (NG entry/exit) |
| `rb_N` | `priority` | Roundabout north node (shape only, no arm) |
| `rb_E` | `priority` | Roundabout east node (TL entry/exit) |
| `rb_S` | `priority` | Roundabout south node (stem entry/exit) |
| `slip_div` | `priority` | TL westbound diverge to slip (≈ X +60, before roundabout) |
| `stem_S` | `priority` | Stem meets bottom road (merge SB, diverge NB) |
| `slip_merge` | `priority` | Slip merges into bottom road westbound |
| `uturn_W` | `priority` | U-turn opening (westbound → eastbound) |

Declare the ring in `<roundabout nodes="rb_W rb_N rb_E rb_S" edges="..."/>` so SUMO applies yield-on-entry.

### 4.2 Edges (`gnt_circle.edg.xml`)
| ID | From → To | Lanes | Purpose |
| :--- | :--- | :--- | :--- |
| `NG_in` | NG_end → rb_W | 3 | From NG towards roundabout |
| `NG_out` | rb_W → NG_end | 3 | Roundabout to NG |
| `TL_in_a` | TL_end → slip_div | 3 | From TL |
| `TL_in_b` | slip_div → rb_E | 2–3 | TL continuing to roundabout |
| `TL_out` | rb_E → TL_end | 3 | Roundabout to TL |
| `rb_W_N`, `rb_N_E`, `rb_E_S`, `rb_S_W` | ring | 2 | **Clockwise** ring segments (W→N→E→S→W) |
| `stem_sb` | rb_S → stem_S | 2 | Roundabout down to bottom road |
| `stem_nb` | stem_S → rb_S | 2 | Bottom road up to roundabout |
| `slip_TL_FL` | slip_div → slip_merge | 1–2 | Free left TL → FL |
| `bot_wb_a` | slip_merge → stem_S | 2 | Slip traffic westbound |
| `bot_wb_b` | stem_S → uturn_W | 3 | Westbound (stem SB + slip) |
| `FL_out` | uturn_W → FL_end | 3 | To flyover |
| `FL_in` | FL_end → uturn_W | 3 | From flyover |
| `bot_eb` | uturn_W → stem_S | 3 | Eastbound, feeds stem NB |
| `uturn` | (connection at uturn_W) | 1 | `bot_wb_b` rightmost (median) lane → `bot_eb` |

> In left-hand traffic the median-side lane is the **highest lane index**. The U-turn connects from the median lane of `bot_wb_b` to the median lane of `bot_eb`.

---

## 5. Movements / Routes (`gnt_circle.rou.xml`)

All O-D pairs and the path each takes:

| Route ID | O → D | Path |
| :--- | :--- | :--- |
| `r_NG_TL` | NG → TL | NG_in → rb_W_N → rb_N_E → TL_out |
| `r_NG_FL` | NG → FL | NG_in → rb_W_N → rb_N_E → rb_E_S → stem_sb → bot_wb_b → FL_out |
| `r_NG_NG` | NG → NG (U) | NG_in → full ring → NG_out *(optional, low share)* |
| `r_TL_NG` | TL → NG | TL_in_a → TL_in_b → rb_E_S → rb_S_W → NG_out |
| `r_TL_FL` | TL → FL | TL_in_a → slip_TL_FL → bot_wb_a → bot_wb_b → FL_out *(free left, no roundabout)* |
| `r_TL_TL` | TL → TL (U) | TL_in_a → TL_in_b → ring ×¾ → TL_out *(optional)* |
| `r_FL_NG` | FL → NG | FL_in → bot_eb → stem_nb → rb_S_W → NG_out |
| `r_FL_TL` | FL → TL | FL_in → bot_eb → stem_nb → rb_S_W → rb_W_N → rb_N_E → TL_out |
| `r_FL_FL` | FL → FL (U) | FL_in → bot_eb → stem_nb → ring → stem_sb → … → FL_out *(rare)* |
| `r_Uturn_*` | via U-turn | …→ bot_wb_b → **uturn** → bot_eb → stem_nb → rb_S → NG/TL |

U-turn use case (per sketch label "To Nallagandla, Tellapur"): westbound traffic on the bottom road that wants NG/TL turns back at the gap and goes up the stem. **[OPEN-4]**: who generates this traffic? (see §11).

### 5.1 Default demand (to be put in `scenario.xml`)
| Origin | Inflow (veh/h) | Destination split |
| :--- | :--- | :--- |
| NG | 1200 | TL 70%, FL 25%, NG 5% |
| TL | 1200 | NG 60%, FL 35%, TL 5% |
| FL | 900 | NG 50%, TL 50% |
| U-turn | 150 | NG 50%, TL 50% (origin = TL slip/stem traffic re-routing) |

Vehicle mix: car 70%, van 12%, truck 8%, sports 10% (reuse existing vTypes). **[OPEN-5]**: add `motorcycle` / `auto_rickshaw` for Indian mix?

---

## 6. Priority & Conflict Rules (no signals)

1. **Roundabout**: circulating traffic has priority; entering traffic **yields** (SUMO `<roundabout>` + `priority` nodes).
2. **TL free-left slip**: diverges before the roundabout; no conflict at diverge. Merges into bottom westbound road with **yield** to through traffic (`bot_wb_a` lower priority than stem SB at `stem_S`, or zipper merge **[OPEN-6]**).
3. **stem_S**: stem SB merges into bottom westbound (yield to slip stream or vice versa — decide in OPEN-6). Bottom eastbound turns left into stem NB (free, no conflict).
4. **U-turn**: U-turning vehicles **yield** to eastbound `FL_in` traffic (`bot_eb` major, uturn minor).
5. No pedestrian crossings in v1.

---

## 7. Backend Requirements

- `backend/app/scenarios/gnt_circle.py` extending `BaseScenario`:
  - `get_metadata()` → id `gnt_circle`, name "GNT Circle", description.
  - `get_network_info()` → bounding box, roundabout centre/radii, arm list (`NG`, `TL`, `FL`), lane polylines read from `.net.xml` (non-straight geometry — send shapes, not just X ranges).
  - Origin weights keyed by `NG`/`TL`/`FL` (+ `UTURN`).
- `traffic_light` field in state message → `null` for this scenario.
- Compact vehicle tuple `direction` field → use origin→dest code, e.g. `"NG-TL"`.
- `scenario.xml` holds inflow, mix, OD splits, max sim time (default 600 s).

## 8. Frontend Requirements

- `CanvasView` must render arbitrary **polyline lane shapes** (curves for ring/slip/U-turn) from network info.
- Draw central island (green), raised medians (hatched), dashed lane markings, yield markings at roundabout entries.
- Labels on arms: "NG", "TL", "FL" with full names on hover.
- MiniMap: 2D bounding-box overview (not the 1000 m bar); hide signal marker.
- StatsPanel: per-arm inflow/outflow counts, roundabout occupancy, U-turn count.

---

## 9. Metrics

| Metric | Definition |
| :--- | :--- |
| Throughput per O-D | arrivals per route ID per hour |
| Avg delay per arm | actual travel time − free-flow time |
| Entry queue length | halting vehicles on last 100 m of `NG_in`, `TL_in_b`, `stem_nb` |
| Roundabout occupancy | vehicles on ring edges |
| U-turn usage | vehicles traversing `uturn` connection |

---

## 10. Validation Checklist

- [ ] `netconvert` builds with `--lefthand true`, zero errors/warnings about unconnected lanes.
- [ ] Ring circulation is **clockwise** in `sumo-gui`.
- [ ] Every route in §5 is valid (`duarouter`/`sumo --route-steps` no "no connection" errors).
- [ ] No traffic lights in `.net.xml` (`<tlLogic>` absent).
- [ ] Entering vehicles yield to circulating vehicles.
- [ ] TL→FL vehicles never enter ring edges.
- [ ] U-turn only allowed westbound → eastbound at `uturn_W`.
- [ ] No teleports in a 600 s run at default demand.
- [ ] Frontend renders curves and vehicle headings correctly around the ring.
- [ ] `test_ws.py` passes for `gnt_circle` (start/pause/stop, vehicles appear from all three arms).

---

## 11. Open Questions (please confirm)

| # | Question | Current assumption |
| :--- | :--- | :--- |
| OPEN-1 | Lanes on roundabout ring? | 2 |
| OPEN-2 | Lanes per direction on main road, stem, bottom road? | 3 / 2 / 3 |
| OPEN-3 | Speed limits? | 50 km/h roads, 25 km/h ring |
| OPEN-4 | Does the bottom road's eastbound side (`FL_in`) carry traffic **from** the flyover, or is it only fed by the U-turn? | Both: FL is a real origin, U-turn adds to it |
| OPEN-5 | Add Indian vehicle types (2-wheeler, auto)? | No (reuse existing) |
| OPEN-6 | Merge priority at bottom road: stem SB vs TL slip? | Slip yields to stem SB |
| OPEN-7 | Does NG → TL traffic go round the northern arc of the circle (as drawn) — no bypass lane? | Yes, all via ring |
| OPEN-8 | Is the middle-left "To Nallagandla" road the same as `NG_out` (i.e., TL→NG exits the ring at its SW side)? | Yes |
| OPEN-9 | Real-world dimensions (arm lengths, island diameter) — use satellite measurements? | Values in §3 |
