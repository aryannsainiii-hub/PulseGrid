from .hospital_graph import build_hospital_graph
from .scenario_builder import normalize_config
from .propagation_engine import run_timeline
from . import impact_analysis as ia

ASSUMPTIONS = [
 "Synthetic hospital model; every number is invented for demonstration.",
 "Time advances in 5-minute steps; every dependency transmits with a one-step (5 min) lag.",
 "Capacity = own health x product of dependency factors; factor = 1 - strength x (1 - supply).",
 "Redundant sources (utility + generator) add their supply, weighted by share, capped at 100%.",
 "Local reserves (UPS, cylinders, thermal inertia) bridge short deficits for a fixed buffer time.",
 "Severity maps to capacity loss: moderate 40, high 85, critical 100 points.",
 "Interventions are hypothetical, take effect after a fixed delay and consume finite resource pools.",
 "No probabilities, clinical outcomes or real response times are modelled.",
]
LIMITATIONS = [
 "Decision-support prototype: suggestions require human review and authorisation.",
 "Capacity is a proxy for service availability; patient outcomes cannot be determined from this model.",
 "Propagation strengths and thresholds are assumptions, not validated measurements.",
]

def run_simulation(raw_config, default_duration=60, enforce_resource_limits=True, with_counterfactual=True):
    cfg = normalize_config(raw_config, default_duration, enforce_resource_limits)
    graph = build_hospital_graph()  # fresh isolated copy; engine never mutates it
    tl = run_timeline(graph, cfg)
    impacts = ia.node_impacts(graph, tl)
    path, roots, depth = ia.cascade(graph, impacts)
    summary = ia.summarize(graph, cfg, tl, impacts, path, roots, depth)
    res = dict(config=cfg, summary=summary, timeline=tl, cascade_path=path, roots=roots, node_impacts=impacts,
               explanation=ia.explanation(graph, cfg, impacts, path, roots, summary), resources=ia.resources_view(cfg, tl),
               recovery=ia.recovery_view(cfg, impacts, tl), interventions=ia.intervention_views(cfg, tl),
               counterfactual=None, assumptions=ASSUMPTIONS, limitations=list(LIMITATIONS))
    if cfg["interventions"] and with_counterfactual:
        base = run_simulation({**cfg, "interventions": []}, default_duration, True, False)
        bn = {i["node_id"]: i for i in base["node_impacts"]}
        imp = [i["name"] for i in impacts if i["final_capacity"] - bn[i["node_id"]]["final_capacity"] >= 1]
        wor = [i["name"] for i in impacts if bn[i["node_id"]]["final_capacity"] - i["final_capacity"] >= 1]
        res["counterfactual"] = dict(peak_impact_without=base["summary"]["overall_impact"], peak_impact_with=summary["overall_impact"],
                                     final_impact_without=base["summary"]["final_impact"], final_impact_with=summary["final_impact"],
                                     improved=imp, worsened=wor)
    if not cfg["interventions"] and all(d.get("resolution_minutes") is None for d in cfg["disruptions"]):
        res["limitations"].append("No resolution or intervention configured: end-of-horizon recovery cannot be determined from this model.")
    return res
