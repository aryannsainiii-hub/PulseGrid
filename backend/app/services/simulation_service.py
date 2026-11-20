from ..database import Repository
from ..engine.runner import run_simulation
from ..engine.response_planner import build_plan
from ..engine.comparison_engine import compare
from ..engine.hospital_graph import build_hospital_graph, model_dict
from ..engine.scenario_builder import ScenarioValidationError
from ..engine.scenario_definitions import SCENARIOS, INCIDENT_TYPES, SEVERITIES, get_scenario, scenario_to_config
from ..engine.intervention_engine import catalog
from ..engine.hospital_graph import downstream
from .settings_service import SettingsService

class NotFound(LookupError):
    pass

def _label(plan):
    b = next((s for s in plan["strategies"] if s["key"] == plan["best_strategy"]), None)
    return f"{b['name']} – {b['title']}" if b else None

class PulseGridService:
    def __init__(self, repo=None):
        self.repo = repo or Repository()
        self.settings = SettingsService(self.repo)

    # --- simulations
    def run(self, raw, parent_id=None, branch_label=None):
        st = self.settings.get()
        if parent_id and not self.repo.get_simulation(parent_id):
            raise NotFound(f"parent simulation {parent_id} not found")
        result = run_simulation(raw, default_duration=st["default_duration_minutes"])
        sid = self.repo.save_simulation(result, parent_id, branch_label)
        self._plan(sid, result["config"], st)
        self.repo.set_kv("active_simulation_id", sid)
        return self.get(sid)
    def validate(self, raw):
        from ..engine.scenario_builder import normalize_config
        return normalize_config(raw, self.settings.get()["default_duration_minutes"])
    def get(self, sid):
        r = self.repo.get_simulation(sid)
        if not r: raise NotFound(f"simulation {sid} not found")
        r["plan"] = self.repo.latest_plan_for(sid)
        return r
    def list(self, q=None, severity=None, sort="created_at", order="desc"):
        rows = self.repo.list_simulations()
        if q: rows = [r for r in rows if q.lower() in (r["name"] or "").lower() or q.lower() in (r["branch_label"] or "").lower() or q.lower() in (r["best_strategy"] or "").lower()]
        if severity: rows = [r for r in rows if r["severity"] == severity]
        if sort not in ("created_at", "name", "severity", "overall_impact", "affected_count"): sort = "created_at"
        sev_rank = {"moderate": 0, "high": 1, "critical": 2}
        key = (lambda r: sev_rank.get(r["severity"], 0)) if sort == "severity" else (lambda r: (r[sort] is None, r[sort]))
        return sorted(rows, key=key, reverse=(order != "asc"))
    def clear_history(self):
        self.repo.clear_simulations(); self.repo.del_kv("active_simulation_id")

    # --- plans
    def _plan(self, sid, config, st):
        plan = build_plan(config, st["weights"], st["max_recovery_minutes"], st["response_start_minute"])
        pid = self.repo.save_plan(sid, plan)
        self.repo.set_best_strategy(sid, _label(plan))
        return pid
    def create_plan(self, sid):
        sim = self.repo.get_simulation(sid)
        if not sim: raise NotFound(f"simulation {sid} not found")
        pid = self._plan(sid, sim["config"], self.settings.get())
        return self.repo.get_plan(pid)
    def get_plan(self, pid):
        p = self.repo.get_plan(pid)
        if not p: raise NotFound(f"plan {pid} not found")
        return p

    # --- compare
    def compare(self, ids):
        if len(set(ids)) < 2: raise ScenarioValidationError([{"field": "simulation_ids", "message": "select at least two distinct simulations"}])
        return compare([self.get(i) for i in ids])

    # --- catalogue
    def scenarios(self):
        g = build_hospital_graph(); out = []
        for s in SCENARIOS:
            cfg = scenario_to_config(s)
            roots = sorted({INCIDENT_TYPES[d["type"]]["default_target"] for d in cfg["disruptions"]})
            aff = sorted({n for r in roots for n in downstream(g, r)} | set(roots))
            out.append(dict(**{k: v for k, v in s.items()}, initial_failure_points=[dict(id=r, name=g.nodes[r]["name"]) for r in roots],
                            potentially_affected=[dict(id=n, name=g.nodes[n]["name"]) for n in aff], severity_options=SEVERITIES, default_config=cfg))
        return out
    def scenario(self, sid):
        s = next((x for x in self.scenarios() if x["id"] == sid), None)
        if not s: raise NotFound(f"scenario {sid} not found")
        return s
    def incident_types(self):
        return [dict(type=k, **v) for k, v in INCIDENT_TYPES.items()]
    def interventions(self):
        return catalog()

    # --- dashboard
    def dashboard(self):
        g = build_hospital_graph(); sid = self.repo.get_kv("active_simulation_id")
        sim = self.repo.get_simulation(sid) if sid else None
        nodes = []
        last = sim["timeline"][-1] if sim else None
        for n, d in g.nodes(data=True):
            st = last["nodes"][n] if last else dict(capacity=100.0, status="healthy", on_buffer=False)
            nodes.append(dict(id=n, name=d["name"], category=d["category"], status=st["status"], capacity=st["capacity"]))
        dept = [n for n in nodes if n["category"] == "department"]
        active = 0
        if sim:
            active = sum(1 for d in sim["config"]["disruptions"] if d["resolution_minutes"] is None or d["start_minute"] + d["resolution_minutes"] > sim["config"]["duration_minutes"])
        backup = (last["nodes"]["backup_gen"]["capacity"] * last["backup"]["fuel_remaining_pct"] / 100.0) if last else 100.0
        recent = sorted(self.repo.list_simulations(), key=lambda r: r["created_at"], reverse=True)[:5]
        return dict(synthetic=True, active_simulation=dict(id=sim["id"], name=sim["name"]) if sim else None,
                    kpis=dict(total_systems=len(nodes), operational_systems=sum(1 for n in nodes if n["status"] == "healthy"),
                              affected_departments=sum(1 for n in dept if n["status"] != "healthy"), total_departments=len(dept),
                              active_incidents=active, backup_capacity_pct=round(backup, 1)),
                    systems=nodes, recent_simulations=recent)
    def clear_incident(self):
        self.repo.del_kv("active_simulation_id")
    def reset_demo(self):
        self.repo.clear_simulations(); self.repo.del_kv("active_simulation_id"); self.settings.reset()
