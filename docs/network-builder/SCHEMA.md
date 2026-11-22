# `network.json` Schema Reference (v1)

A `network.json` file is the single source of truth for a self-serve road network in Traffis Desktop. Traffis validates it, compiles it into SUMO XML via `netconvert`, and loads it into the simulator under **My Networks**.

## Storage Locations
- **Bundled examples (read-only):** `backend/app/network_builder/examples/<id>/network.json`
- **User networks:** `$TRAFFIS_NETWORKS_DIR/<id>/network.json` (default: `~/Traffis/networks/<id>/network.json`)
- **Compiled build cache:** `<network_dir>/build/` (regenerated automatically whenever `network.json` changes)

---

## Top-Level Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `schema_version` | `1` | Yes | Schema version (must be `1`). |
| `id` | `string` | Yes | Unique identifier matching `^[A-Za-z][A-Za-z0-9_]*$`. Scenario ID becomes `net_<id>`. |
| `name` | `string` | Yes | Human-readable display name. |
| `description` | `string` | No | Optional summary shown in the UI. |
| `settings` | `NetworkSettings` | No | Global drive side, default speed, and lane width. |
| `junctions` | `JunctionDef[]` | Yes | At least 2 junctions (coordinates in metres, Y-up). |
| `roads` | `RoadDef[]` | Yes | At least 1 road connecting two distinct junctions. |
| `signals` | `SignalPlanDef[]` | No | Optional fixed-time signal plans for `traffic_light` junctions. |
| `demand` | `DemandDef` | No | Vehicle mix and origin-destination flows. |
| `obstacles` | `ObstacleDef[]` | No | Lane blockages (stalled vehicles) and full lane closures. |

### `settings`
| Field | Default | Range |
| :--- | :--- | :--- |
| `drive_side` | `"left"` | `"left"` (India/UK) or `"right"` |
| `default_speed_kmh` | `50.0` | `5` – `150` |
| `lane_width_m` | `3.2` | `2.0` – `5.0` |

### `junctions[]`
| Field | Type | Notes |
| :--- | :--- | :--- |
| `id` | `string` | Unique, `[A-Za-z][A-Za-z0-9_]*` |
| `x`, `y` | `number` | World coordinates in metres |
| `type` | `string` | `"priority"`, `"right_before_left"`, `"allway_stop"`, or `"traffic_light"` (needs ≥ 2 roads) |
| `label` | `string?` | Optional label rendered on the canvas |

### `roads[]`
| Field | Type | Notes |
| :--- | :--- | :--- |
| `id` | `string` | Unique, `[A-Za-z][A-Za-z0-9_]*` |
| `from`, `to` | `string` | Existing, distinct junction IDs |
| `lanes` | `int` | `1`–`8` lanes in `from → to` direction (edge `<id>_f`) |
| `lanes_back` | `int` | `0`–`8` lanes in `to → from` direction (edge `<id>_b`); `0` = one-way |
| `speed_kmh` | `number?` | Optional override (`5`–`150`); defaults to `settings.default_speed_kmh` |
| `points` | `[x, y][]` | Optional intermediate polyline shape points |
| `name` | `string?` | Optional street name |

### `signals[]`
| Field | Type | Notes |
| :--- | :--- | :--- |
| `junction` | `string` | ID of a `traffic_light` junction |
| `amber_s` | `number` | Amber duration in seconds (default `3`) |
| `all_red_s` | `number` | All-red clearance in seconds (default `2`) |
| `offset_s` | `number` | Cycle offset in seconds (default `0`) |
| `phases[]` | `object[]` | `{ "approaches": ["road_id", ...], "green_s": 30, "name": "..." }` |

Each road in `approaches` must have an incoming lane entering `junction`. Conflicting green movements automatically receive yield-green (`g`) using SUMO's compiled junction response matrix.

### `demand`
- `vehicle_mix`: map of vehicle type (`car`, `sports`, `van`, `truck`, `motorcycle`, `auto_rickshaw`) to share; shares must sum to `1.0 ± 0.01`.
- `flows[]`: `{ "id", "from", "to", "vehs_per_hour" }` where `from` and `to` are distinct boundary junctions (each connected to exactly 1 road) with a valid path in the compiled network.

### `obstacles[]`
| Field | Type | Notes |
| :--- | :--- | :--- |
| `id` | `string` | Unique, `[A-Za-z][A-Za-z0-9_]*` |
| `kind` | `string` | `"blockage"` (stationary obstacle in lane) or `"lane_closure"` (`disallow="all"`) |
| `road` | `string` | Existing road ID |
| `direction` | `string` | `"forward"` (`from → to`) or `"backward"` (`to → from`) |
| `lane` | `int` | 0-indexed lane (0 = kerbside) |
| `position_m` | `number?` | Required for `"blockage"`: distance from start of edge |
| `length_m` | `number?` | Blockage length in metres (default `8`) |
| `label` | `string?` | Optional canvas callout text |

---

## REST API

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/networks` | List all bundled examples and user networks |
| `GET` | `/api/networks/{id}` | Fetch `network.json` for a network |
| `PUT` | `/api/networks/{id}` | Validate, save to user dir, compile, and register under **My Networks** |
| `DELETE` | `/api/networks/{id}` | Delete a user network (cannot delete active scenario or read-only example) |
| `POST` | `/api/networks/validate` | Validate JSON + optionally run `netconvert` (`?compile=true`, default `true`) |
