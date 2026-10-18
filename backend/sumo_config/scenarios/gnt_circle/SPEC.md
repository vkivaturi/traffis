# GNT Circle — Scenario Specification

> Status: **FINAL – v1.0 (2026-10-17)**. Derived from the whiteboard sketch and confirmed with the product owner.
> Scenario ID: `gnt_circle`. Read this spec before writing SUMO XML or backend/frontend code.
> Former open items are resolved as **decisions** in §11. Geometry values in §3 are design defaults (no survey data).

---

## 1. Summary

GNT Circle is an **unsignalised** junction with:
- A **clockwise roundabout** (the "GNT Circle") on the main NG ⇄ TL corridor.
- A **divided two-way stem** running south from the roundabout to a lower east–west road.
- A **single-lane free left** for all TL traffic at the roundabout: TL's 2 lanes merge into one lane that curves round the circle's south-east side and merges into the stem southbound kerb lane (no ring entry).
- A lower **undivided road** (double solid centre line) leading west to/from the Flyover (FL), with a **U-turn opening**.

There are **no traffic signals** anywhere. All conflicts are resolved by priority rules (§6).

> [!IMPORTANT]
> **TL → NG traffic CANNOT go straight through GNT Circle.**
> There is **no entry into the roundabout from the TL arm** (`rb_E` is exit-only for TL).
> TL → NG vehicles must:
> 1. Take the single-lane **free left** at the circle and flow **south** down the stem to the bottom road (westbound).
> 2. Take the **U-turn** through the centre-line opening on the bottom road (`uturn_W`).
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
  NG_out ══◀══════╮   │Circle│   ╭═════════════◀══  TL_in (2 lanes → 1)
                  ╰──◀│(cw) │  ╭╯  (NO entry into circle from TL)
                      ╰┬───┬╯ ╭╯  single-lane free left: ALL TL traffic
                 stem ▲│   │▼╭╯   (TL→FL, and TL→NG via U-turn)
                  NB  ││   │◀╯    merges into stem SB kerb lane (yields)
                       │   │
  FL_in  ══▶═══════════╯   │
  ═ ═ ═ ═ ═ U ═ ═ ═ ═ ═ ═ ═│   (double solid centre line, U-turn gap at "U")
  FL_out ══◀═══════════════╯
```

- Top road: **main corridor NG ⇄ TL**, undivided, double solid centre line.
- Roundabout: sits on the main corridor; its northern arc bulges above the road.
- Stem: two-way undivided link (double solid centre line) from the roundabout's south side down to the bottom road; the TL free left joins its southbound kerb lane ~45 m below the ring.
- Bottom road: undivided, eastbound upper carriageway feeds the stem NB; westbound lower carriageway collects stem SB (incl. TL free-left traffic) and runs to FL.

---

## 3. Coordinate System & Geometry

Same conventions as other scenarios: metres, X → right, Y → up (sketch top = +Y). Origin at roundabout centre.

| Element | Proposed value | Notes |
| :--- | :--- | :--- |
| Roundabout centre | (0, 0) | Node cluster `gnt_rb_*` |
| Central island radius | 10 m (inner edge of the ring) | D-9 |
| Circulating carriageway | 2 lanes, 7.0 m wide | D-1 |
| Outer radius | ~17 m | |
| Main road (NG arm) length | 150 m (X: −160 → −10, ring node) | D-9 |
| Main road (TL arm) length | 150 m (X: +10 → +160, ring node) | D-9 |
| Main road carriageway | NG: 2 lanes / direction (4-lane road); TL: 2 lanes / direction (4-lane road); 3.2 m | D-2 |
| Centre lines | Double solid yellow lines, no raised medians | like the 3-way intersection UI |
| Stem length | 100 m (Y: −10 → −80, connects to bottom road via R=30m sweeping curve) | D-9 |
| Stem carriageway | 3 lanes / direction, 3.2 m | D-2 |
| TL free left | 1 lane (TL_in 2 → 1 at X = +45), short quarter-ellipse arc round the circle's south-east side, merges into stem SB lane 0 at Y = −24 (14 m below the ring) | All TL traffic |
| Bottom road length | 150 m, FL end → stem junction (X: −150 → 0), curves smoothly into the stem | |
| Bottom road carriageway | 3 lanes / direction | D-2 |
| U-turn gap | X = −110 m (40 m from FL end, 110 m from stem junction), gap width 12 m | Westbound → eastbound only |
| Speed limit (main/bottom) | 50 km/h (13.89 m/s) | urban, D-3 |
| Speed limit (roundabout) | 25 km/h (6.94 m/s) | |
| Speed limit (free left) | 20 km/h (5.56 m/s) | |
| Speed limit (U-turn connection) | 30 km/h (8.33 m/s) | aggressive U-turn (§5.2.5) |

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
| `tl_fl` | `priority` | End of TL_in (X = +45): 2 lanes merge into the single free-left lane. **All** TL traffic goes here — no ring entry |
| `stem_merge` | `priority` | Free left merges into stem SB kerb lane (Y = −24); free left yields |
| `stem_S` | `priority` | Top tangent of the sweeping curve into the stem (x = 0, y = −80) |
| `uturn_W` | `priority` | U-turn opening (westbound → eastbound) |

Declare the ring in `<roundabout nodes="rb_W rb_N rb_E rb_S" edges="..."/>` so SUMO applies yield-on-entry.

### 4.2 Edges (`gnt_circle.edg.xml`)
| ID | From → To | Lanes | Purpose |
| :--- | :--- | :--- | :--- |
| `NG_in` | NG_end → rb_W | 2 | From NG towards roundabout |
| `NG_out` | rb_W → NG_end | 2 | Roundabout to NG |
| `TL_in` | TL_end → tl_fl | 2 | From TL (only connects to the free left) |
| ~~`TL_in_b`~~ | — | — | **Does not exist.** No TL entry into the ring |
| `TL_out` | rb_E → TL_end | 2 | Roundabout to TL |
| `rb_W_N`, `rb_N_E`, `rb_E_S`, `rb_S_W` | ring | 2 | **Clockwise** ring segments (W→N→E→S→W) |
| `stem_sb_a` | rb_S → stem_merge | 2 | Ring exit down to the free-left merge |
| `stem_sb_b` | stem_merge → stem_S | 2 | Stem SB after the merge (ring exit + TL free left) |
| `stem_nb` | stem_S → rb_S | 2 | Bottom road up to roundabout |
| `TL_free_left` | tl_fl → stem_merge | 1 | Free left at the circle; carries TL→FL **and** TL→NG/TL→TL (U-turn bound) |
| `bot_wb_b` | stem_S → uturn_W | 3 | Westbound: sweeping curve + straight road to U-turn and FL |
| `FL_out` | uturn_W → FL_end | 3 | To flyover |
| `FL_in` | FL_end → uturn_W | 3 | From flyover |
| `bot_eb` | uturn_W → stem_S | 3 | Eastbound straight road + sweeping curve (50 km/h), feeds stem NB |
| `uturn` | (connection at uturn_W) | 1 | `bot_wb_b` rightmost (median) lane → `bot_eb` |

> In left-hand traffic the median-side lane is the **highest lane index**. The U-turn connects from the median lane of `bot_wb_b` to the median lane of `bot_eb`.

---

## 5. Movements / Routes (`gnt_circle.rou.xml`)

All O-D pairs and the path each takes:

| Route ID | O → D | Path |
| :--- | :--- | :--- |
| `r_NG_TL` | NG → TL | NG_in → rb_W_N → rb_N_E → TL_out |
| `r_NG_FL` | NG → FL | NG_in → rb_W_N → rb_N_E → rb_E_S → stem_sb_a → stem_sb_b → bot_wb_b → FL_out |
| `r_NG_NG` | NG → NG (U) | NG_in → full ring → NG_out *(optional, low share)* |
| `r_TL_NG` | TL → NG | TL_in → TL_free_left → stem_sb_b → bot_wb_b → **uturn** → bot_eb → stem_nb → rb_S_W *(left at circle)* → NG_out |
| `r_TL_FL` | TL → FL | TL_in → TL_free_left → stem_sb_b → bot_wb_b → FL_out *(free left at the circle, no ring)* |
| `r_TL_TL` | TL → TL (U) | TL_in → TL_free_left → stem_sb_b → bot_wb_b → uturn → bot_eb → stem_nb → rb_S_W → rb_W_N → rb_N_E → TL_out *(optional)* |
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

- Range per key: any value `≥ 0` veh/h (no upper cap); `0` disables that flow. Demand above road capacity queues at the network edge (insertion backlog).
- Each key becomes one SUMO `<flow>` with `vehsPerHour`, `departLane="random"`, `departPosLat="random"` (vehicles enter on a random lane at a random lateral offset — Indian driving), `departSpeed="desired"`, and `type` = the global vType distribution (§5.2).
- Values are loaded on every reset/scenario switch (same mechanism as existing scenarios; not runtime-tunable from the UI).

### 5.2 Vehicle behaviour — global (simulation-level) settings

Driver/vehicle behaviour is configured **once for the whole simulation**, not per direction or lane. Every flow draws from the same `vTypeDistribution id="indian_mix"`. Goal: reproduce **Indian urban conditions** — small gaps, high impatience, aggressive merging and lateral filtering.

#### 5.2.1 Global model settings
| Setting | SUMO mapping | Default | Why |
| :--- | :--- | :--- | :--- |
| Car-following model | `carFollowModel` | `Krauss` | Consistent with existing scenarios |
| Lane-change model | `laneChangeModel` | `SL2015` | Required for sub-lane / filtering |
| Lateral resolution | `--lateral-resolution` (sumocfg) | `0.8` m | Enables sub-lane filtering / tight lateral spacing |
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
| `auto_rickshaw` | 30% | 2.6 / 1.4 | 14.0 | 1.8 / 4.0 | `minGap 0.8`, `sigma 0.7` |
| `car` | 60% | 4.3 / 1.7 | 30.0 | 2.6 / 4.5 | — |
| `van` | 10% | 5.0 / 1.9 | 25.0 | 2.0 / 4.2 | — |

No motorcycles, trucks or buses in this scenario (motorcycles were removed; their share was spread proportionally). Shares must sum to 100%. Frontend needs a render branch for `auto_rickshaw`. (`motorcycle` remains defined in `BUILTIN_VTYPES` and can be re-enabled by adding a `<vtype>` to `scenario.xml`.)

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
    <vtype id="auto_rickshaw" share="0.30" minGap="0.8" sigma="0.7"/>
    <vtype id="car" share="0.60"/>
    <vtype id="van" share="0.10"/>
  </vehicleMix>
</scenario>
```
Rules for the loader (`settings_loader.py`):
- Precedence: per-vtype attribute in `<vehicleMix>` > global `<behaviour>` param > built-in vType default (§5.2.3) > SUMO default.
- `<behaviour>` params are passed through as vType attributes verbatim (any valid SUMO vType attribute is allowed) — the loader must not hard-code a whitelist beyond basic name validation.
- Generated `gnt_circle.rou.xml` contains the resolved vTypes, the `vTypeDistribution`, and one `<flow>` per non-zero OD key.
- Invalid values (shares ≠ 1.0 ± 0.01, negative veh/h, unknown OD key) → fail scenario load with a clear error.

#### 5.2.5 Aggressive driver behaviour & deadlock prevention at GNT Circle
Vehicles force their way through conflict points without deadlock:
1. NG entry into the roundabout at `rb_W` (`NG_in → rb_W_N`).
2. Roundabout circulating traffic continuing from `rb_S_W → rb_W_N` (e.g. `FL_TL`) has priority and `pass="true"` so it never gets blocked or starved by entering `NG_in` traffic.
3. The TL free-left merge into the stem SB kerb lane at `stem_merge`.
4. The TL median U-turn at `uturn_W` heading towards FL (`TL_NG`).

Applied per vehicle on departure by `GntCircleScenario._make_aggressive()` in `backend/app/scenarios/gnt_circle.py`:

| Knob | Where | Current value | Effect |
| :--- | :--- | :--- | :--- |
| `impatience` | `AGGRESSIVE_IMPATIENCE` → `setImpatience` | `1.0` | Maximum willingness to push into gaps |
| `minGap` | `AGGRESSIVE_MIN_GAP` → `setMinGap` | `0.3` m | Tiny bumper-to-bumper gap |
| `tau` | `AGGRESSIVE_TAU` → `setTau` | `0.3` s | Tiny following headway |
| Right-of-way bypass | `FORCE_EDGES`, `SPEED_MODE_FORCE` → `setSpeedMode` | `{TL_free_left, bot_wb_b, NG_in, rb_S_W}`, mode `23` | While on these edges vehicles ignore right-of-way at the junction ahead (NG entry, ring continuation, merge, U-turn), preventing polite deadlocks; reset to `31` afterwards |
| Connection `pass` | `gnt_circle.con.xml` | `true` on `NG_in→rb_W_N`, `rb_S_W→rb_W_N`, `TL_free_left→stem_sb_b`, and U-turn | Vehicles may enter without yielding |
| Lane separation | `gnt_circle.con.xml` | `rb_S_W_0 → NG_out_0`, `rb_S_W_1 → NG_out_1 & rb_W_N_1` | Eliminates internal X-crossings at junction `rb_W` |
| U-turn connection `speed` | `gnt_circle.con.xml` (`bot_wb_b`→`bot_eb`) | `8.33` m/s (30 km/h) | Speed through the U-turn |

Note: SUMO rejects `junctionModel.*` via `traci.vehicle.setParameter`, and per-OD vType ids would break frontend rendering (type id drives colour/shape), hence the speed-mode approach.

Tuning: lower `minGap`/`tau` or add edges to `FORCE_EDGES` for more forcing; set `SPEED_MODE_FORCE = 31` to restore polite yielding. Forced vehicles can overlap foes — watch collisions and `teleports` in junction metrics. Changing `.con.xml` requires re-running `python backend/sumo_config/build_network.py`; changing `gnt_circle.py` needs a backend restart (the backend does not hot-reload).

---

## 6. Priority & Conflict Rules (no signals)

1. **Roundabout**: circulating traffic has priority; entering traffic **yields** (SUMO `<roundabout>` + `priority` nodes).
2. **TL free left**: TL's 3 lanes zip-merge into one lane at `tl_fl`. At `stem_merge` the free-left stream **yields** to ring-exit traffic on `stem_sb_a` and joins the kerb (left-most) lane — the intended congestion point at the circle.
3. **stem_S**: stem SB is major for the westbound merge. Bottom eastbound turns left into stem NB (free, no conflict).
4. **U-turn**: U-turning vehicles **yield** to eastbound `FL_in` traffic (`bot_eb` major, uturn minor).
5. No pedestrian crossings in v1.

### 6.1 Optional Roundabout Signals (UI-Switchable)
Users can optionally enable traffic signals at GNT Circle via the UI Scenario Configuration panel (`roundabout_signals` option):
- **Controlled movements**:
  - `NG_in → rb_W_N`: Carries **both NG → FL and NG → TL** traffic into the roundabout. Both movements share the same signal head at stop lines `X = -18.56` (both are green together, or both are red together).
  - `rb_S_W → rb_W_N`: Carries **FL → TL** circulating traffic continuing past `rb_W` on the ring (alternates with NG entry).
- **Uncontrolled movements (no signals)**:
  - `rb_S_W → NG_out` (FL → NG exit): Stays free-flowing green at all times (`GG`).
  - `TL_free_left` (TL → FL and TL → NG U-turn bound): Completely bypasses the roundabout and continues without a signal.
- **Default state**: Disabled (`false`). When disabled, all traffic merges unsignalised at the roundabout as described in §6.

---

## 7. Backend Requirements

- `backend/app/scenarios/gnt_circle.py` extending `BaseScenario`:
  - `get_metadata()` → id `gnt_circle`, name "GNT Circle", description.
  - `get_network_info()` → bounding box, roundabout centre/radii, arm list (`NG`, `TL`, `FL`), lane polylines read from `.net.xml` (non-straight geometry — send shapes, not just X ranges).
  - Demand keyed by the six OD keys (§5.1); no origin weights.
- `traffic_light` field in state message → `null` for this scenario.
- Compact vehicle tuple `direction` field → use OD key, e.g. `"NG_TL"`.
- `scenario.xml` (§5.2.4) holds per-OD veh/h, global behaviour params, vehicle mix, max sim time (default 600 s).
- Add `auto_rickshaw` (and optionally `motorcycle`) to allowed vehicle types in `schemas.py` / `types/simulation.ts`.

## 8. Frontend Requirements

- `CanvasView` must render arbitrary **polyline lane shapes** (curves for ring/free left/U-turn) from network info.
- Draw central island (green), double solid yellow centre lines (no raised medians), dashed lane markings, yield markings at roundabout entries.
- Labels on arms: "NG", "TL", "FL" with full names on hover.
- StatsPanel: per-arm inflow/outflow counts, roundabout occupancy, U-turn count.

---

## 9. Metrics

| Metric | Definition |
| :--- | :--- |
| Throughput per O-D | arrivals per OD key per hour (compare with configured veh/h) |
| Avg travel time per O-D | mean time from entering to leaving the network for completed trips of that OD route |
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
- [ ] **Every TL→NG vehicle traverses `TL_free_left` → `uturn` → `stem_nb` → `rb_S_W` → `NG_out`.**
- [ ] TL→NG vehicles enter the ring only at `rb_S` and leave at the first exit (`rb_W`).
- [ ] U-turn only allowed westbound → eastbound at `uturn_W`.
- [ ] No teleports in a 600 s run at default demand.
- [ ] Frontend renders curves and vehicle headings correctly around the ring.
- [ ] `test_ws.py` passes for `gnt_circle` (start/pause/stop, vehicles appear from all three arms).
- [ ] Each of the 6 OD keys produces vehicles only on its own route; setting a key to `0` removes that flow.
- [ ] Generated vTypes reflect `<behaviour>` params and per-vtype overrides with the precedence in §5.2.4.
- [ ] Vehicles use sub-lane spacing (sub-lane model active); no motorcycles are spawned.

---

## 11. Decisions (resolved)

| # | Topic | Decision |
| :--- | :--- | :--- |
| D-1 | Lanes on roundabout ring | 2 |
| D-2 | Lanes per direction: NG main / TL main / stem / bottom | 2 / 2 / 3 / 3 |
| D-3 | Speed limits | 50 km/h roads, 25 km/h ring, 20 km/h free left, 30 km/h U-turn connection |
| D-4 | `FL_in` traffic | Carries FL origin traffic **and** TL→NG U-turn traffic |
| D-5 | Vehicle types | Mix: auto_rickshaw, car, van — no motorcycles, trucks or buses (§5.2.3) |
| D-6 | Merge priority at `stem_merge` | TL free left yields to ring-exit stem SB traffic; joins the kerb lane |
| D-7 | NG → TL | All via ring northern arc, no bypass |
| D-8 | Mid-left "To Nallagandla" road | Is `NG_out` (left exit from stem at `rb_W`) |
| D-9 | Dimensions | Design defaults in §3 (no survey); NG, TL and FL arms 150 m each, stem 100 m; island radius 10 m |
| D-10 | TL → NG | South → U-turn → left at GNT Circle; no straight movement |
| D-11 | Demand config | Per-OD veh/h for 6 directions (§5.1) |
| D-12 | Behaviour config | Global, simulation-level SUMO vType params (§5.2) |
