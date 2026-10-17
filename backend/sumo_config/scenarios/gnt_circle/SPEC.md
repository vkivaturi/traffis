# GNT Circle — Scenario Specification

> Status: **FINAL – v1.0 (2026-10-17)**. Derived from the whiteboard sketch and confirmed with the product owner.
> Scenario ID: `gnt_circle`. Read this spec before writing SUMO XML or backend/frontend code.
> Former open items are resolved as **decisions** in §11. Geometry values in §3 are design defaults (no survey data).

---

## 1. Summary

GNT Circle is an **unsignalised** junction with:
- A **clockwise roundabout** (the "GNT Circle") on the main NG ⇄ TL corridor.
- A **divided two-way stem** running south from the roundabout to a lower east–west road.
- A **free-left slip** from TL down to the lower road (towards FL), bypassing the roundabout.
- A lower **divided road** leading west to/from the Flyover (FL), with a **median U-turn opening**.

There are **no traffic signals** anywhere. All conflicts are resolved by priority rules (§6).

> [!IMPORTANT]
> **TL → NG traffic CANNOT go straight through GNT Circle.**
> There is **no entry into the roundabout from the TL arm** (`rb_E` is exit-only for TL).
> TL → NG vehicles must:
> 1. Flow **south** via the TL free-left slip down to the bottom road (westbound).
> 2. Take the **U-turn** in the bottom-road median (`uturn_W`).
> 3. Travel back east and **north up the stem** to GNT Circle.
> 4. **Take a left** at GNT Circle (first exit, clockwise from `rb_S` to `rb_W`) onto `NG_out`.
>
> Any route using `TL_in → rb_E → ring → NG_out` is **invalid** and must fail validation.

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
                  ╰──◀│(cw) │  │  (NO entry into circle from TL)
                      ╰┬───┬╯  │
                 stem ▲│   │▼  │  free-left slip: ALL TL traffic
                  NB  ││   ││SB│  (TL→FL, and TL→NG via U-turn)
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
| Central island radius | 20 m | D-9 |
| Circulating carriageway | 2 lanes, 7.0 m wide | D-1 |
| Outer radius | ~27 m | |
| Main road (NG arm) length | 300 m (X: −330 → −30) | D-9 |
| Main road (TL arm) length | 300 m (X: +30 → +330) | D-9 |
| Main road carriageway | 3 lanes / direction, 3.2 m | D-2 |
| Main road median | 2.0 m raised | hatched in sketch |
| Stem length | 150 m (Y: −27 → −177) | D-9 |
| Stem carriageway | 2 lanes / direction, 3.2 m, median 1.5 m | |
| TL slip | 2 lanes, joins bottom road at X≈+60 | Left of stem, curve radius ~15 m |
| Bottom road length | 400 m (X: −340 → +60), Y ≈ −190 | |
| Bottom road carriageway | 3 lanes / direction | D-2 |
| U-turn gap | X ≈ −250 m, gap width 12 m | Westbound → eastbound only |
| Speed limit (main/bottom) | 50 km/h (13.89 m/s) | urban, D-3 |
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
| `rb_E` | `priority` | Roundabout east node — **exit-only** to TL (no TL entry) |
| `rb_S` | `priority` | Roundabout south node (stem entry/exit) |
| `slip_div` | `priority` | TL westbound turns south into slip (≈ X +60). **All** TL traffic goes here — no continuation to roundabout |
| `stem_S` | `priority` | Stem meets bottom road (merge SB, diverge NB) |
| `slip_merge` | `priority` | Slip merges into bottom road westbound |
| `uturn_W` | `priority` | U-turn opening (westbound → eastbound) |

Declare the ring in `<roundabout nodes="rb_W rb_N rb_E rb_S" edges="..."/>` so SUMO applies yield-on-entry.

### 4.2 Edges (`gnt_circle.edg.xml`)
| ID | From → To | Lanes | Purpose |
| :--- | :--- | :--- | :--- |
| `NG_in` | NG_end → rb_W | 3 | From NG towards roundabout |
| `NG_out` | rb_W → NG_end | 3 | Roundabout to NG |
| `TL_in` | TL_end → slip_div | 3 | From TL (only connects to slip) |
| ~~`TL_in_b`~~ | — | — | **Does not exist.** No TL entry into the ring |
| `TL_out` | rb_E → TL_end | 3 | Roundabout to TL |
| `rb_W_N`, `rb_N_E`, `rb_E_S`, `rb_S_W` | ring | 2 | **Clockwise** ring segments (W→N→E→S→W) |
| `stem_sb` | rb_S → stem_S | 2 | Roundabout down to bottom road |
| `stem_nb` | stem_S → rb_S | 2 | Bottom road up to roundabout |
| `slip_TL_FL` | slip_div → slip_merge | 2 | Free left TL → south; carries TL→FL **and** TL→NG/TL→TL (U-turn bound) |
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
| `r_TL_NG` | TL → NG | TL_in → slip_TL_FL → bot_wb_a → bot_wb_b → **uturn** → bot_eb → stem_nb → rb_S_W *(left at circle)* → NG_out |
| `r_TL_FL` | TL → FL | TL_in → slip_TL_FL → bot_wb_a → bot_wb_b → FL_out *(free left, no roundabout)* |
| `r_TL_TL` | TL → TL (U) | TL_in → slip_TL_FL → bot_wb_a → bot_wb_b → uturn → bot_eb → stem_nb → rb_S_W → rb_W_N → rb_N_E → TL_out *(optional)* |
| `r_FL_NG` | FL → NG | FL_in → bot_eb → stem_nb → rb_S_W → NG_out |
| `r_FL_TL` | FL → TL | FL_in → bot_eb → stem_nb → rb_S_W → rb_W_N → rb_N_E → TL_out |

**In scope (v1): exactly the six O-D routes** `r_NG_TL`, `r_NG_FL`, `r_TL_FL`, `r_TL_NG`, `r_FL_NG`, `r_FL_TL`. Same-arm U-turns (`r_NG_NG`, `r_TL_TL`, `r_FL_FL`) are defined in the route file for completeness but have **0 veh/h** and are not exposed in config.

The U-turn is the **mandatory path for all TL → NG traffic**. It is not a separate origin; U-turn volume = `TL_NG` flow.

### 5.1 Demand configuration — per O-D (in `scenario.xml`)

Each of the six directions has its own **vehicles-per-hour** value. No origin-total + split percentages.

| Config key | O → D | Route | Default (veh/h) |
| :--- | :--- | :--- | :--- |
| `NG_TL` | NG → TL | `r_NG_TL` | 900 |
| `NG_FL` | NG → FL | `r_NG_FL` | 300 |
| `TL_FL` | TL → FL | `r_TL_FL` | 450 |
| `TL_NG` | TL → NG | `r_TL_NG` (via U-turn) | 750 |
| `FL_NG` | FL → NG | `r_FL_NG` | 450 |
| `FL_TL` | FL → TL | `r_FL_TL` | 450 |

- Range per key: `0`–`3000` veh/h; `0` disables that flow.
- Each key becomes one SUMO `<flow>` with `vehsPerHour`, `departLane="best"`, `departSpeed="desired"`, and `type` = the global vType distribution (§5.2).
- Values are loaded on every reset/scenario switch (same mechanism as existing scenarios; not runtime-tunable from the UI).

### 5.2 Vehicle behaviour — global (simulation-level) settings

Driver/vehicle behaviour is configured **once for the whole simulation**, not per direction or lane. Every flow draws from the same `vTypeDistribution id="indian_mix"`. Goal: reproduce **Indian urban conditions** — small gaps, high impatience, aggressive merging and lateral filtering.

#### 5.2.1 Global model settings
| Setting | SUMO mapping | Default | Why |
| :--- | :--- | :--- | :--- |
| Car-following model | `carFollowModel` | `Krauss` | Consistent with existing scenarios |
| Lane-change model | `laneChangeModel` | `SL2015` | Required for sub-lane / filtering |
| Lateral resolution | `--lateral-resolution` (sumocfg) | `0.8` m | Enables two-wheelers to filter between cars |
| Junction blocking tolerance | `--ignore-junction-blocker` | `10` s | Prevents gridlock in ring |
| Teleport time | `--time-to-teleport` | `120` s | Clears deadlocks; teleports counted in metrics |

#### 5.2.2 Behaviour parameters (applied to every vType unless overridden in §5.2.3)
| Parameter | SUMO attribute | Default (Indian) | SUMO default | Effect |
| :--- | :--- | :--- | :--- | :--- |
| Min gap | `minGap` | **1.0** m | 2.5 | Bumper gap when stopped |
| Headway | `tau` | **0.6** s | 1.0 | Following headway |
| Driver imperfection | `sigma` | **0.6** | 0.5 | Speed fluctuation |
| Impatience | `impatience` | **0.8** | 0.0 | Forces entry into ring / merges after waiting |
| Speed factor | `speedFactor` | **normc(1.1,0.15,0.7,1.5)** | 1.0 | Speed-limit compliance (≈ 10% over) |
| Lane-change assertiveness | `lcAssertive` | **2.0** | 1.0 | Accepts smaller gaps |
| Cooperative LC | `lcCooperative` | **0.3** | 1.0 | Less yielding to others |
| Speed-gain LC | `lcSpeedGain` | **2.0** | 1.0 | Frequent overtaking |
| Keep-left urge | `lcKeepRight`* | **0.3** | 1.0 | Weak lane discipline (*"keepRight" = keep to driving side; left in lefthand nets) |
| Lateral alignment | `latAlignment` | `arbitrary` | `center` | Vehicles don't centre in lane |
| Min lateral gap | `minGapLat` | **0.3** m | 0.6 | Side-by-side tightness |
| Junction: ignore foes after wait | `jmIgnoreFoeProb` / `jmIgnoreFoeSpeed` | **0.1** / 5.0 | 0 | Occasional forcing at yields |
| Junction: drive after red/yield time | `jmDriveAfterYellowTime` / `jmTimegapMinor` | — / **0.5** s | — / 1.0 | Smaller accepted gap entering ring |

#### 5.2.3 Vehicle classes & mix (global)
| vType | Share | Length / Width (m) | Max speed (m/s) | Accel / Decel | Overrides |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `motorcycle` | 40% | 2.0 / 0.8 | 22.0 | 3.5 / 6.0 | `minGap 0.5`, `minGapLat 0.2`, `lcAssertive 3.0`, `vClass motorcycle` |
| `auto_rickshaw` | 15% | 2.6 / 1.4 | 14.0 | 1.8 / 4.0 | `minGap 0.8`, `sigma 0.7` |
| `car` | 30% | 4.3 / 1.7 | 30.0 | 2.6 / 4.5 | — |
| `bus` | 5% | 12.0 / 2.5 | 18.0 | 1.0 / 3.5 | `minGap 1.5`, `lcAssertive 1.5` |
| `truck` | 5% | 10.0 / 2.4 | 18.0 | 1.0 / 3.5 | `minGap 1.5` |
| `van` | 5% | 5.0 / 1.9 | 25.0 | 2.0 / 4.2 | — |

Shares must sum to 100%. Frontend needs render branches for `motorcycle`, `auto_rickshaw`, `bus`.

#### 5.2.4 `scenario.xml` shape (normative)
```xml
<scenario id="gnt_circle" maxSimTime="600">
  <demand>
    <od key="NG_TL" vehsPerHour="900"/>
    <od key="NG_FL" vehsPerHour="300"/>
    <od key="TL_FL" vehsPerHour="450"/>
    <od key="TL_NG" vehsPerHour="750"/>
    <od key="FL_NG" vehsPerHour="450"/>
    <od key="FL_TL" vehsPerHour="450"/>
  </demand>
  <behaviour carFollowModel="Krauss" laneChangeModel="SL2015" lateralResolution="0.8">
    <!-- Global defaults: any SUMO vType attribute allowed; applied to all vTypes -->
    <param key="minGap" value="1.0"/>
    <param key="tau" value="0.6"/>
    <param key="sigma" value="0.6"/>
    <param key="impatience" value="0.8"/>
    <param key="speedFactor" value="normc(1.1,0.15,0.7,1.5)"/>
    <param key="lcAssertive" value="2.0"/>
    <param key="lcCooperative" value="0.3"/>
    <param key="lcSpeedGain" value="2.0"/>
    <param key="lcKeepRight" value="0.3"/>
    <param key="latAlignment" value="arbitrary"/>
    <param key="minGapLat" value="0.3"/>
    <param key="jmIgnoreFoeProb" value="0.1"/>
    <param key="jmIgnoreFoeSpeed" value="5.0"/>
    <param key="jmTimegapMinor" value="0.5"/>
  </behaviour>
  <vehicleMix>
    <vtype id="motorcycle" share="0.40" minGap="0.5" minGapLat="0.2" lcAssertive="3.0"/>
    <vtype id="auto_rickshaw" share="0.15" minGap="0.8" sigma="0.7"/>
    <vtype id="car" share="0.30"/>
    <vtype id="bus" share="0.05" minGap="1.5" lcAssertive="1.5"/>
    <vtype id="truck" share="0.05" minGap="1.5"/>
    <vtype id="van" share="0.05"/>
  </vehicleMix>
</scenario>
```
Rules for the loader (`settings_loader.py`):
- Precedence: per-vtype attribute in `<vehicleMix>` > global `<behaviour>` param > built-in vType default (§5.2.3) > SUMO default.
- `<behaviour>` params are passed through as vType attributes verbatim (any valid SUMO vType attribute is allowed) — the loader must not hard-code a whitelist beyond basic name validation.
- Generated `gnt_circle.rou.xml` contains the resolved vTypes, the `vTypeDistribution`, and one `<flow>` per non-zero OD key.
- Invalid values (shares ≠ 1.0 ± 0.01, negative veh/h, unknown OD key) → fail scenario load with a clear error.

---

## 6. Priority & Conflict Rules (no signals)

1. **Roundabout**: circulating traffic has priority; entering traffic **yields** (SUMO `<roundabout>` + `priority` nodes).
2. **TL free-left slip**: diverges before the roundabout; no conflict at diverge. At `stem_S` the slip stream (`bot_wb_a`) **yields** to stem SB traffic.
3. **stem_S**: stem SB is major for the westbound merge. Bottom eastbound turns left into stem NB (free, no conflict).
4. **U-turn**: U-turning vehicles **yield** to eastbound `FL_in` traffic (`bot_eb` major, uturn minor).
5. No pedestrian crossings in v1.

---

## 7. Backend Requirements

- `backend/app/scenarios/gnt_circle.py` extending `BaseScenario`:
  - `get_metadata()` → id `gnt_circle`, name "GNT Circle", description.
  - `get_network_info()` → bounding box, roundabout centre/radii, arm list (`NG`, `TL`, `FL`), lane polylines read from `.net.xml` (non-straight geometry — send shapes, not just X ranges).
  - Demand keyed by the six OD keys (§5.1); no origin weights.
- `traffic_light` field in state message → `null` for this scenario.
- Compact vehicle tuple `direction` field → use OD key, e.g. `"NG_TL"`.
- `scenario.xml` (§5.2.4) holds per-OD veh/h, global behaviour params, vehicle mix, max sim time (default 600 s).
- Add `motorcycle`, `auto_rickshaw`, `bus` to allowed vehicle types in `schemas.py` / `types/simulation.ts`.

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
| Throughput per O-D | arrivals per OD key per hour (compare with configured veh/h) |
| Avg delay per arm | actual travel time − free-flow time |
| Entry queue length | halting vehicles on last 100 m of `NG_in`, `stem_nb` (ring entries) and `TL_in` |
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
- [ ] **No connection exists from `TL_in` to any ring edge** (`rb_E` has no incoming edge from TL).
- [ ] **Every TL→NG vehicle traverses `slip_TL_FL` → `uturn` → `stem_nb` → `rb_S_W` → `NG_out`.**
- [ ] TL→NG vehicles enter the ring only at `rb_S` and leave at the first exit (`rb_W`).
- [ ] U-turn only allowed westbound → eastbound at `uturn_W`.
- [ ] No teleports in a 600 s run at default demand.
- [ ] Frontend renders curves and vehicle headings correctly around the ring.
- [ ] `test_ws.py` passes for `gnt_circle` (start/pause/stop, vehicles appear from all three arms).
- [ ] Each of the 6 OD keys produces vehicles only on its own route; setting a key to `0` removes that flow.
- [ ] Generated vTypes reflect `<behaviour>` params and per-vtype overrides with the precedence in §5.2.4.
- [ ] Motorcycles visibly filter between cars (sub-lane model active).

---

## 11. Decisions (resolved)

| # | Topic | Decision |
| :--- | :--- | :--- |
| D-1 | Lanes on roundabout ring | 2 |
| D-2 | Lanes per direction: main / stem / bottom | 3 / 2 / 3 |
| D-3 | Speed limits | 50 km/h roads, 25 km/h ring, 20 km/h slip & U-turn |
| D-4 | `FL_in` traffic | Carries FL origin traffic **and** TL→NG U-turn traffic |
| D-5 | Vehicle types | Indian mix: motorcycle, auto_rickshaw, car, bus, truck, van (§5.2.3) |
| D-6 | Merge priority at `stem_S` | Slip yields to stem SB |
| D-7 | NG → TL | All via ring northern arc, no bypass |
| D-8 | Mid-left "To Nallagandla" road | Is `NG_out` (left exit from stem at `rb_W`) |
| D-9 | Dimensions | Design defaults in §3 (no survey) |
| D-10 | TL → NG | South → U-turn → left at GNT Circle; no straight movement |
| D-11 | Demand config | Per-OD veh/h for 6 directions (§5.1) |
| D-12 | Behaviour config | Global, simulation-level SUMO vType params (§5.2) |
