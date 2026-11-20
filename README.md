# PulseGrid
**AI-Powered Hospital Resilience & Emergency Decision Support System** — *Keeping Critical Care Connected.*

> **Demo environment, synthetic data only.** PulseGrid is a decision-support prototype. It does not control hospital
> infrastructure or medical devices, makes no clinical decisions, and has not been deployed in any hospital.
> Every recommendation is a simulated suggestion that requires human review and authorisation.
> "AI" here means explainable graph algorithms and transparent scoring. **No trained ML model is used.**

## 1. Problem
When one piece of hospital infrastructure fails (e.g. main power), the real danger is the chain reaction: oxygen compressors,
IT, HVAC, then ICU, ED and theatres. Planners need to see that cascade and compare responses under finite resources.

## 2. Solution
Hospital dependency graph (NetworkX) + time-stepped cascading disruption simulation + resource-constrained response planning,
wrapped in a warm light-themed web app whose centrepiece is the **Simulation Lab**.

## 3. Features
- Dashboard, Hospital Map (React Flow, filters, node inspector), Simulations, Results, Response Planner, Scenario Library, History, Settings.
- **Simulation Lab** (`/simulation-lab`): multi-disruption scenario builder, 5-minute time steps computed by the backend,
  play / pause / resume / step / restart / speed, live cascade highlighting, node impact history, event feed,
  recovery view, **hypothetical interventions at any paused time step**, **what-if branches** (originals never overwritten).
- **Scenario Comparison** (`/scenario-comparison`): impact timelines, per-system end states, resources, recovery, strategy scores, generated explanation of differences.
- Everything persists in SQLite, including per-step snapshots; runs can be replayed.

## 4. Stack and deviations (please read)
Frontend: React 18, TypeScript, Vite, Tailwind 3, React Router, `@xyflow/react`, Recharts, lucide-react.
Backend: Python 3.12, FastAPI, Pydantic v2, NetworkX. Database: SQLite.

**Deviation: persistence uses stdlib `sqlite3` behind a small repository class (`backend/app/database.py`), not SQLAlchemy.**
The build sandbox had no network, so SQLAlchemy could not be installed or verified. All SQL lives in that one file, so
moving to SQLAlchemy/PostgreSQL only touches it. NumPy is listed but not needed by the engine.

## 5. Architecture
```
backend/app/
  main.py, database.py, routers/api.py, schemas/api.py        # HTTP, validation, errors
  services/{simulation_service,settings_service}.py            # use-cases, persistence orchestration
  engine/                                                      # pure Python, no web/UI imports
    hospital_graph.py   build + validate the NetworkX graph (fresh copy per run)
    scenario_definitions.py  incident types, severities, scenario library (data-driven)
    scenario_builder.py validation / normalisation (collects every error)
    simulation_clock.py 5-minute discrete clock
    propagation_engine.py  time-stepped cascade
    intervention_engine.py hypothetical interventions + resource costs
    recovery_engine.py  recovery assumptions
    impact_analysis.py  summaries, cascade path, explanations
    response_planner.py strategies A/B/C, constraints, scoring
    comparison_engine.py side-by-side comparison
    runner.py           run_simulation(config)
  seed/hospital_seed.py  synthetic hospital (14 nodes, 45 edges, resource pools)
frontend/src/{pages,components,services,hooks,types,utils}
```

## 6. Run it
```bash
# Backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # optional
uvicorn app.main:app --reload --port 8000                # API docs: http://127.0.0.1:8000/docs

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                                              # http://localhost:5173 (proxies /api to :8000)
```
The database file and tables are created automatically on first start. No paid APIs or external services.

## 7. API (all under `/api`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/hospital/model`, `/hospital/nodes`, `/hospital/edges` | synthetic graph |
| GET | `/dashboard/summary` | KPIs, system status, recent runs (reflects the latest simulation) |
| GET | `/scenarios`, `/scenarios/{id}` · `/incident-types` · `/interventions` | catalogues |
| POST | `/simulations` | validate, run, persist (+ auto response plan). Optional `parent_id`, `branch_label` create a branch |
| POST | `/simulations/validate` | validate only |
| GET | `/simulations` (`q,severity,sort,order`), `/simulations/{id}` | history / full result with timeline |
| DELETE | `/simulations?confirm=true` | clear history |
| POST | `/response-plans` `{simulation_id}` · GET `/response-plans/{id}` | (re)compute plan with current settings |
| POST | `/comparisons` `{simulation_ids}` | compare 2–6 saved runs |
| GET/PUT | `/settings` | durations, scoring weights, display |
| POST | `/demo/reset`, `/demo/clear-incident` | reset demo / clear dashboard incident |

Errors use one shape: `{"error": {"code", "message", "details": [{"field","message"}]}}` with 404 / 422.

## 8. Simulation algorithm
Time advances in 5-minute steps. Every dependency transmits with a lag of at least one step, so step *k* depends only on steps < *k*:
**cycles cannot loop** (the model contains an HVAC ↔ IT-network cycle on purpose).
For node *n* at step *k*:
1. `own_health` = Π(1 − loss) over active disruptions at *n* (severity loss: moderate 40, high 85, critical 100 points; recovering after `resolution_minutes` at a per-type rate), plus any restore interventions.
2. Per dependency group *g*: `supply_g = min(100, Σ source_output(k−delay)·share/100 + intervention boosts)`; `factor_g = 1 − strength·(1 − supply_g/100)`.
   Redundant sources (utility + generator, shares 100 and 50) add up; independent dependencies compound multiplicatively.
3. `dependency_capacity = 100·Π factor_g`. A deficit shorter than the node's local-reserve `buffer_minutes` is bridged (status *at risk*, capacity held).
4. `capacity = own_health·dependency_capacity/100`, optionally curtailed by an intervention (load shedding).
5. Status: *critical* if capacity < minimum operating capacity; *at risk* if below the at-risk threshold or on reserve; else *healthy*.
6. Backup generator: starts 5 min after supply degrades, consumes fuel (`generator_fuel_hours`), never starts if the fault is downstream (switchgear).
Overall impact per step = criticality-weighted mean capacity loss over all nodes; the headline figure is the **peak**.
Cascade path/depth are derived from the dominant dependency at each node's first impact. Same config ⇒ byte-identical results.

## 9. Response scoringg
Strategies are intervention bundles evaluated by **re-running the simulation**: A *Critical Load Prioritisation*, B *Resource Reallocation* (portable generators / oxygen cylinders / IT failover / surge staff matched to the disruption), C *Combined* (A + B + alternative-supply escalation).
```
raw   = w_cov·coverage − w_res·resource_use − w_rec·recovery_delay − w_viol·violation_share     (each term 0..1)
score = 100·(raw − raw_min)/(raw_max − raw_min),  raw_max = w_cov,  raw_min = −(w_res + w_rec + w_viol)
```
coverage = time-averaged criticality-weighted department capacity; resource_use = mean used/available over consumable pools;
recovery_delay = min(1, minutes-to-stabilise / max_recovery_minutes), 1 if never; violation_share = critical departments still below minimum operating capacity at the end.
**Hard constraint:** exceeding any resource pool ⇒ infeasible, never ranked, never recommended. Defaults 0.4 / 0.3 / 0.3 / 0.3 (editable in Settings).

## 10. Synthetic data assumptions
All capacities, strengths, thresholds, reserve times, resource pools and intervention effects (e.g. +8 supply points per portable generator) are **invented, illustrative assumptions**. No probabilities, clinical outcomes, or real response times are modelled.

## 11. Tests
```bash
cd backend && python -m unittest discover -s app/tests -t .     # or: pytest
cd frontend && npm test
```
**Status of what was actually executed during development:**
- Backend engine, planner, persistence and service tests: **49 tests executed, all passed** (graph, all incident types × severities, cascade, redundancy, cycles, thresholds, multi-disruption, delayed disruptions, recovery, interventions incl. branch-prefix identity, resource limits, strategy feasibility, scoring formula, repeatability, persistence across instances, branching, search/sort, reset, invalid input).
- `backend/app/tests/test_api.py` (FastAPI TestClient) and the whole **FastAPI layer were written but NOT run** (FastAPI was unavailable in the build sandbox); they self-skip if FastAPI is missing. Only syntax-compiled.
- **Frontend was NOT built, type-checked or run** (no npm network access). It was only parse-checked. Expect to fix small type/runtime issues on first `npm install && npm run dev`. The 5 Vitest tests were never executed. No Playwright e2e tests exist.

## 12. Limitations
Single hospital model, fixed seed (no editor). No authentication (out of scope). Playback is client-side stepping over backend-computed states; "continue after intervention" re-runs the engine as a branch (steps before the effect are identical, verified by test). Planner evaluates the incident without its own applied interventions. Recovery only exists when a disruption has a resolution time or an intervention restores supply.

## 13. Demo walkthrough
1. **Dashboard**: all 14 systems operational. 2. **Hospital Map**: click Power Distribution to see what it supplies. 3. **Simulation Lab**: load *Main Power Failure*, add a second disruption (Oxygen, T+10), **Run**.
4. **Play**: ICU/ED/OT go on local reserve, then critical around T+25. 5. **Pause** at e.g. T+20, choose *Prioritise critical loads*, **Apply & continue** (new branch).
6. **What-if**: *Generator unavailable*. 7. **Compare runs**. 8. **Response Planner** (ranking, feasibility, trade-offs). 9. **History**: every run, with best strategy, persists across refresh.
Try Settings → resource pools (Lab builder) to see strategies become infeasible, e.g. portable generators = 1.
