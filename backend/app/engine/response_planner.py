"""Resource-constrained response planning.

Strategies are bundles of the same hypothetical interventions the simulator supports, and
every metric comes from re-running the simulation engine with that bundle. Nothing is guessed.

Score (raw)  = w_cov*coverage - w_res*resource_use - w_rec*recovery_delay - w_viol*violation_share
  coverage        time-averaged criticality-weighted department capacity / 100          (0..1)
  resource_use    mean over consumable pools of used/available                           (0..1)
  recovery_delay  min(1, minutes_to_stabilise / max_recovery_minutes), 1 if never        (0..1)
  violation_share critical departments below minimum operating capacity at horizon end / critical depts (0..1)
Displayed score = 100*(raw - raw_min)/(raw_max - raw_min), raw_max = w_cov, raw_min = -(w_res+w_rec+w_viol).
Strategies violating a hard resource limit are infeasible and never ranked.
"""
import copy
from .runner import run_simulation
from .scenario_builder import normalize_config, default_resources
from . import intervention_engine as ie
from ..seed.hospital_seed import CONSUMABLE_POOLS

DISCLAIMER = "Simulated decision-support suggestion. Requires human review and authorisation; PulseGrid never controls hospital systems."
DEFAULT_WEIGHTS = dict(coverage=0.4, resources=0.3, recovery=0.3, violations=0.3)
STRATEGIES = {
 "A": dict(name="Strategy A", title="Critical Load Prioritisation", summary="Direct scarce supply to ICU, ED and OT first; curtail non-critical departments in deficit."),
 "B": dict(name="Strategy B", title="Resource Reallocation", summary="Deploy eligible backup resources matched to each disruption type."),
 "C": dict(name="Strategy C", title="Combined Response", summary="Prioritisation plus resource reallocation plus an operational escalation for the primary failure."),
}
POWER = {"main_power_failure", "backup_generator_failure"}

def _realloc(disruptions, start):
    types = {d["type"] for d in disruptions}
    out = []
    if types & POWER: out.append(dict(type="deploy_portable_generators", at_minute=start, params={"units": 2}))
    if "oxygen_supply_disruption" in types: out.append(dict(type="deploy_oxygen_cylinders", at_minute=start))
    if "network_outage" in types: out.append(dict(type="activate_it_failover", at_minute=start))
    if "staff_shortage" in types: out.append(dict(type="activate_surge_staffing", at_minute=start))
    return out

def strategy_interventions(key, disruptions, start):
    a = [dict(type="prioritise_critical_loads", at_minute=start)]
    b = _realloc(disruptions, start)
    if key == "A": return a
    if key == "B": return b
    tgt = disruptions[0]["target"]
    esc = [dict(type="activate_alternative_supply", at_minute=start, params={"node": tgt if tgt in ("main_power", "backup_gen", "oxygen_plant", "it_network") else "main_power"})]
    return a + b + esc

def _coverage(res):
    dept = [i for i in res["node_impacts"] if i["category"] == "department"]
    w = sum(d["criticality"] for d in dept)
    vals = []
    for s in res["timeline"]:
        vals.append(sum(d["criticality"] * s["nodes"][d["node_id"]]["capacity"] for d in dept) / w)
    return sum(vals) / len(vals), vals[-1]

def _stabilise(res):
    """Earliest minute from which no department is critical through the end; None if never."""
    tl = res["timeline"]
    dept = [i["node_id"] for i in res["node_impacts"] if i["category"] == "department"]
    m = None
    for s in reversed(tl):
        if any(s["nodes"][d]["status"] == "critical" for d in dept):
            break
        m = s["minute"]
    return m

def _metrics(res, resources, used):
    cov, fin = _coverage(res)
    pools = [k for k in CONSUMABLE_POOLS if resources[k] > 0]
    util = sum(used.get(k, 0) / resources[k] for k in pools) / len(pools) if pools else 0.0
    last = res["timeline"][-1]["nodes"]
    crit = [i["node_id"] for i in res["node_impacts"] if i["category"] == "department" and i["criticality"] >= 5]
    nodes_meta = {i["node_id"]: i for i in res["node_impacts"]}
    viol = [n for n in crit if last[n]["status"] == "critical"]
    return dict(service_coverage=round(cov, 2), final_coverage=round(fin, 2),
                affected_systems=sum(1 for n in last.values() if n["status"] != "healthy"),
                peak_impact=res["summary"]["overall_impact"], final_impact=res["summary"]["final_impact"],
                resource_use_pct=round(util * 100, 1), resources_used=used,
                remaining_resources={k: resources[k] - used.get(k, 0) for k in CONSUMABLE_POOLS},
                generator_fuel_remaining_pct=res["resources"]["generator"]["remaining_pct"],
                stabilise_minute=_stabilise(res), service_violations=[nodes_meta[n]["name"] for n in viol],
                violation_share=len(viol) / len(crit) if crit else 0.0)

def build_plan(sim_config, weights=None, max_recovery=120, response_start=10):
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    horizon = max(sim_config["duration_minutes"], max_recovery)
    horizon = min(240, ((horizon + 4) // 5) * 5)
    start = max(0, min(response_start, horizon - 5)) // 5 * 5
    base_cfg = {**sim_config, "interventions": [], "duration_minutes": horizon}
    resources = {**default_resources(), **sim_config["resources"]}
    base_cfg["resources"] = resources
    ref = run_simulation(base_cfg, with_counterfactual=False)
    ref_m = _metrics(ref, resources, {})
    out, rmax, rmin = [], w["coverage"], -(w["resources"] + w["recovery"] + w["violations"])
    for key, meta in STRATEGIES.items():
        ivs = strategy_interventions(key, sim_config["disruptions"], start)
        norm = normalize_config({**base_cfg, "interventions": ivs}, enforce_resource_limits=False)
        used = ie.total_cost(norm["interventions"])
        hard = [dict(resource=k, required=v, available=resources.get(k, 0)) for k, v in used.items() if v > resources.get(k, 0)]
        res = run_simulation({**base_cfg, "interventions": ivs}, enforce_resource_limits=False, with_counterfactual=False)
        m = _metrics(res, resources, used)
        delay = 1.0 if m["stabilise_minute"] is None else min(1.0, m["stabilise_minute"] / max_recovery)
        comp = dict(coverage_term=round(w["coverage"] * m["service_coverage"] / 100, 4), resource_penalty=round(w["resources"] * m["resource_use_pct"] / 100, 4),
                    recovery_penalty=round(w["recovery"] * delay, 4), violation_penalty=round(w["violations"] * m["violation_share"], 4))
        raw = comp["coverage_term"] - comp["resource_penalty"] - comp["recovery_penalty"] - comp["violation_penalty"]
        score = 100 * (raw - rmin) / (rmax - rmin) if rmax != rmin else 0.0
        out.append(dict(key=key, **meta, interventions=norm["interventions"], feasible=not hard, hard_violations=hard,
                        metrics=m, recovery_delay_norm=round(delay, 3), components=comp, raw_score=round(raw, 4), score=round(score, 1),
                        estimated_recovery_minutes=m["stabilise_minute"], rank=None))
    feas = sorted([s for s in out if s["feasible"]], key=lambda s: (-s["score"], s["metrics"]["resource_use_pct"], s["key"]))
    for i, s in enumerate(feas):
        s["rank"] = i + 1
    best = feas[0] if feas else None
    return dict(weights=w, horizon_minutes=horizon, response_start_minute=start, reference=dict(label="No response (reference, not ranked)", metrics=ref_m),
                strategies=out, best_strategy=best["key"] if best else None,
                explanation=_explain(out, feas, ref_m), tradeoffs=_tradeoffs(out), limitations=_limits(horizon, max_recovery),
                formula="score = w_cov*coverage - w_res*resource_use - w_rec*recovery_delay - w_viol*violation_share (normalised to 0-100)",
                disclaimer=DISCLAIMER)

def _explain(all_s, feas, ref):
    if not feas:
        return "No strategy is feasible under the configured resource limits, so no recommendation is made. Review resource assumptions."
    b = feas[0]
    txt = f"{b['name']} ({b['title']}) ranks first with a score of {b['score']}: time-averaged service coverage {b['metrics']['service_coverage']}% versus {ref['service_coverage']}% with no response."
    if len(feas) > 1:
        r = feas[1]; dc = b["metrics"]["service_coverage"] - r["metrics"]["service_coverage"]; du = b["metrics"]["resource_use_pct"] - r["metrics"]["resource_use_pct"]
        txt += f" Against {r['name']} (score {r['score']}) it differs by {dc:+.1f} points of coverage and {du:+.1f} points of resource use."
    inf = [s["name"] for s in all_s if not s["feasible"]]
    if inf: txt += f" Infeasible and excluded: {', '.join(inf)}."
    return txt + " " + DISCLAIMER

def _tradeoffs(all_s):
    out = []
    for s in all_s:
        m = s["metrics"]
        out.append(dict(key=s["key"], text=f"{s['name']}: coverage {m['service_coverage']}%, resource use {m['resource_use_pct']}%, "
                        + (f"stabilises by T+{m['stabilise_minute']} min" if m["stabilise_minute"] is not None else "does not stabilise within the horizon")
                        + (f", {len(m['service_violations'])} critical department(s) still below minimum operating capacity" if m["service_violations"] else "")
                        + ("" if s["feasible"] else " — INFEASIBLE: exceeds resource limits") + "."))
    return out

def _limits(horizon, max_rec):
    return [f"Strategies are evaluated over a {horizon}-minute horizon; recovery beyond it is not modelled.",
            "Resource effects (e.g. +8 supply points per portable generator) are illustrative assumptions.",
            "Coverage is infrastructure capacity, not patient outcome. " + DISCLAIMER]
