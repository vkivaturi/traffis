# BL-1 Loop — UI Geometry & Rendering Specification

This document specifies how to render the **BL-1** road network in the Traffis frontend (`CanvasView.tsx` + `geometryRenderer.ts`) so that the on-screen map matches the whiteboard topology, section layout, and landmarks.

---

## 1. How Traffis Renders Complex Road Networks

Traffis renders non-straight networks using `NetworkGeometry` (defined in `backend/app/schemas.py` and consumed by `frontend/src/utils/geometryRenderer.ts`):

1. **Asphalt & Shoulders**: Every lane polyline (`lanes[]`) and junction polygon (`junctions[]`) is read from the compiled SUMO `.net.xml` via `backend/app/scenarios/net_geometry.py` (`load_net_geometry`).
2. **Centre Lines**: Double solid yellow centre lines (`centre_lines[]`) are drawn between opposing carriageways that share a road corridor without a raised median.
3. **Lane Markings & Direction Chevrons**: `geometryRenderer.ts` automatically draws dashed lane dividers (for 3-lane sections), solid kerb/edge lines, and directional chevrons along every lane.
4. **Yield Markings**: Shark-tooth give-way lines (`yield_lanes[]`) are drawn at the downstream end of merging/yielding lanes.
5. **No Traffic Signals**: BL-1 has **no traffic signals** anywhere (`traffic_light: null`, `signal_heads: []`).
6. **Endpoint Labels & Landmarks**:
   - `labels[]` (`ArmLabel`): Interactive endpoint badges (`BIO`, `SHL`, `KON`, `HIT`, `MIN`, `INO`, `THB`, `MHP`).
   - `callouts[]` (`MapCallout`): Static map callouts for landmarks (`IKEA`, `MIND SPACE`, `MY HOME`, `PARK`) and optional section number badges (`1`–`25`).

---

## 2. World Coordinate System & Camera Defaults

- **Units**: World meters `(x, y)` with `+X` = East, `+Y` = North (canvas renderer flips `Y` automatically).
- **Road Width**: Every section is a **3-lane** one-way carriageway (`numLanes = 3`, `width = 3.2 m` per lane → `9.6 m` asphalt width per section).
- **Recommended Bounds**:
  - `min_x: -270.0`, `max_x: 260.0`
  - `min_y: -260.0`, `max_y: 260.0`
- **Default Camera** (`ScenarioMetadata.default_camera`):
  ```json
  { "x": -10.0, "y": -5.0, "zoom": 1.45 }
  ```

---

## 3. Road Topology & Section Geometry (Sections 1–25)

> **Important Note on Whiteboard Numbering**:
> - The number **`4`** appears **twice** on the whiteboard:
>   1. **Section 4 (SHL Outbound)**: Westbound exit toward `SHL` (`sec_4_shl`), used by `THB -> SHL`.
>   2. **Section 4 (Northbound Inner Link)**: Northbound bypass from Section `15` up to Section `8` (`sec_4_nb`), used by `MIN -> HIT`.
> - Section **`23`** is not used on the whiteboard (numbering jumps from `22` to `24`).
> - Section **`16`** is drawn on the whiteboard (Eastbound from the `2/3` junction to the `17/24` junction) and should be rendered in the road geometry, even though none of the 19 listed O-D routes currently traverse it.

### 3.1 Section-by-Section Visual & Geometric Table

| Section | Edge ID | Direction | Approximate Start `(x, y)` | Approximate End `(x, y)` | Visual Shape & Notes |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | `sec_1` | North (`N`) | `(-110, -240)` | `(-110, -140)` | Inbound from `BIO` along bottom-left spine |
| **2** | `sec_2` | North (`N`) | `(-110, -140)` | `(-105, -35)` | Continues North past `20` merge, left of `MY HOME` |
| **3** | `sec_3` | North (`N`) | `(-105, -35)` | `(-95, 34)` | Continues North from `16` junction to `SHL` junction |
| **4 (SHL)** | `sec_4_shl` | West (`W`) | `(-95, 34)` | `(-250, 34)` | Outbound arm to `SHL` (south side of `SHL` corridor) |
| **4 (NB)** | `sec_4_nb` | North (`NNE`) | `(-85, -30)` | `(-52, 155)` | Parallel inner northbound link right of `3`/`6`, left of central block |
| **5** | `sec_5` | East (`E`) | `(-250, 46)` | `(-95, 46)` | Inbound from `SHL`, below `IKEA` (north side of `SHL` corridor) |
| **6** | `sec_6` | North (`NNE`) | `(-95, 46)` | `(-65, 145)` | Main northbound spine past `IKEA` to `KON`/`HIT`/`10` split |
| **7** | `sec_7` | West (`W`) | `(-65, 145)` | `(-250, 160)` | Outbound arm to `KON`, above `IKEA` |
| **8** | `sec_8` | North (`NNE`) | `(-60, 155)` | `(-40, 240)` | Outbound arm to `HIT` (left/west side of `HIT` corridor) |
| **9** | `sec_9` | South (`SSW`) | `(-25, 240)` | `(-48, 160)` | Inbound from `HIT` (right/east side of `HIT` corridor, left of `MIND SPACE`) |
| **10** | `sec_10` | East (`ESE`) | `(-48, 160)` | `(55, 135)` | Connects `6`/`9` across bottom of `MIND SPACE` to `MIN`/`INO`/`14` hub |
| **11** | `sec_11` | South (`SSW`) | `(75, 240)` | `(55, 135)` | Inbound from `MIN`, right of `MIND SPACE` |
| **12** | `sec_12` | East (`E`) | `(55, 141)` | `(240, 141)` | Outbound arm to `INO` (north side of `INO` corridor) |
| **13** | `sec_13` | West (`W`) | `(240, 129)` | `(55, 125)` | Inbound from `INO` (south side of `INO` corridor) |
| **14** | `sec_14` | South (`SSW`) | `(55, 125)` | `(15, -20)` | East spine of loop, gentle curve SSW from `INO`/`MIN` hub to `THB` hub |
| **15** | `sec_15` | West (`W`) | `(15, -20)` | `(-85, -30)` | Upper carriageway between central block and `MY HOME` |
| **16** | `sec_16` | East (`E`) | `(-105, -38)` | `(15, -28)` | Lower carriageway between central block and `MY HOME` |
| **17** | `sec_17` | South (`S`) | `(15, -30)` | `(22, -135)` | Southbound right of `MY HOME` |
| **18** | `sec_18` | West (`W`) | `(22, -135)` | `(-75, -140)` | Westbound between `MY HOME` (north) and `PARK` (south) |
| **19** | `sec_19` | South (`S`) | `(22, -135)` | `(30, -230)` | Southbound right of `PARK` |
| **20** | `sec_20` | West (`W`) | `(-75, -140)` | `(-110, -140)` | Short connector merging `18` back into `1`/`2` |
| **21** | `sec_21` | South (`S`) | `(-75, -140)` | `(-75, -240)` | Outbound to `BIO` (left of `PARK`, parallel to `1`) |
| **22** | `sec_22` | East (`E`) | `(30, -230)` | `(190, -230)` | Outbound to `MHP` at bottom-right |
| **24** | `sec_24` | East (`E`) | `(15, -18)` | `(190, -18)` | Outbound to `THB` (north side of `THB` corridor) |
| **25** | `sec_25` | West (`W`) | `(190, -30)` | `(15, -30)` | Inbound from `THB` (south side of `THB` corridor) |

---

## 4. Opposing Carriageway Pairs (Double Yellow Centre Lines)

Add `CentreLine` entries in `bl_1.py` for corridors where opposing 3-lane carriageways run side-by-side without a median island:
1. **`SHL` corridor**: between `sec_5` (EB) and `sec_4_shl` (WB) along `y = 40`.
2. **`INO` corridor**: between `sec_12` (EB) and `sec_13` (WB) along `y = 135`.
3. **`THB` corridor**: between `sec_24` (EB) and `sec_25` (WB) along `y = -24`.
4. **`15 / 16` corridor**: between `sec_15` (WB) and `sec_16` (EB) along `(-100, -34)` → `(15, -24)`.
5. **`HIT` corridor**: between `sec_8` (NB) and `sec_9` (SB) along `(-50, 160)` → `(-32, 240)`.

*(Note: `sec_1`/`sec_21` at `BIO` and `sec_6`/`sec_4_nb` have lateral separation or one-way flow and do not need a shared centre line, or can use a subtle median island/green strip.)*

---

## 5. Landmarks & Endpoint Labels

### 5.1 Endpoint Badges (`ArmLabel[]`)
Render as interactive pill/badge labels at the outer terminals:
- `BIO` — `(-110, -255)` ("Bio Diversity")
- `SHL` — `(-265, 40)` ("Shilparamam / SHL")
- `KON` — `(-265, 160)` ("Kondapur")
- `HIT` — `(-32, 255)` ("HITEC City")
- `MIN` — `(75, 255)` ("Mindspace")
- `INO` — `(255, 135)` ("Inorbit")
- `THB` — `(205, -24)` ("T-Hub")
- `MHP` — `(205, -230)` ("Madhapur / MHP")

### 5.2 Landmark Blocks (`MapCallout[]` + Optional Polygon Fill)
To make the canvas immediately recognizable against the whiteboard, render subtle dark-slate/translucent building/park footprints with centered `MapCallout` text:
1. **`IKEA`**: Rectangle/trapezoid bounded roughly by `x ∈ [-215, -110]`, `y ∈ [65, 125]`; label at `(-162, 95)`.
2. **`MIND SPACE`**: Block bounded by `x ∈ [-15, 50]`, `y ∈ [170, 235]`; label at `(18, 202)`.
3. **`MY HOME`**: Block bounded by `x ∈ [-65, 5]`, `y ∈ [-120, -45]`; label at `(-30, -82)`.
4. **`PARK`**: Green-tinted block bounded by `x ∈ [-65, 5]`, `y ∈ [-225, -155]`; label at `(-30, -190)`.
5. **Central Island Block** (unnamed on whiteboard): Bounded by `x ∈ [-48, 25]`, `y ∈ [-5, 125]` (surrounded by `4_nb`, `10`, `14`, `15`).

### 5.3 Section Number Badges
Optionally render small circular/pill section numbers (`1`–`22`, `24`–`25`) next to each edge midpoint when `zoom > 1.0` so users can visually trace routes like `BIO → HIT (1, 2, 3, 6, 8)` directly on the live simulation.

---

## 6. Left-Hand Traffic & Visual Polish Checklist
- **Left-Hand Traffic (LHT)**: Vehicles drive on the left side of each 2-way corridor (e.g., on `SHL`, `5` EB is on top/north, `4_shl` WB is on bottom/south; on `HIT`, `8` NB is on left/west, `9` SB is on right/east).
- **Yield Markings (`yield_lanes[]`)**: Add shark-tooth markings at merge points where lower-priority streams join main streams (e.g. `sec_20` merging into `sec_2`, `sec_4_nb` merging into `sec_8`, `sec_5` merging into `sec_6`, `sec_13` merging into `sec_14`, `sec_9` merging with `sec_6` into `sec_10`).
- **No Gantry / Signal Heads**: Ensure `trafficLight` is `undefined` / `null` so no signal heads or stop bars are drawn.

