"""Turns raw timeline snapshots into summaries, cascade path, explanations and recovery views."""
from .recovery_engine import normal_from_minute, EPS
from . import intervention_engine as ie
from ..seed.hospital_seed import RESOURCES, CONSUMABLE_POOLS
RANK = {"healthy": 0, "at_risk": 1, "critical": 2}

def node_impacts(graph, tl):
    out = []
    for n, nd in graph.nodes(data=True):
        hist = [dict(minute=s["minute"], capacity=s["nodes"][n]["capacity"], status=s["nodes"][n]["status"],
                     on_buffer=s["nodes"][n]["on_buffer"], recovery_state=s["nodes"][n]["recovery_state"]) for s in tl]
        affected_steps = [s for s in tl if s["nodes"][n]["status"] != "healthy" or s["nodes"][n]["capacity"] < 100 - EPS]
        first = affected_steps[0] if affected_steps else None
        direct = any(s["nodes"][n]["own_health"] < 100 - EPS for s in tl)
        cause = None
        if first:
            c = first["nodes"][n]["causes"]
            cause = c[0] if c else None
        ever = first is not None
        out.append(dict(node_id=n, name=nd["name"], category=nd["category"], criticality=nd["criticality"],
            baseline_status="healthy", peak_status=max((h["status"] for h in hist), key=RANK.get),
            final_status=hist[-1]["status"], min_capacity=min(h["capacity"] for h in hist), final_capacity=hist[-1]["capacity"],
            first_impact_minute=first["minute"] if first else None,
            critical_minutes=sum(1 for h in hist if h["status"] == "critical") * 5,
            direct_incident=direct, responsible_dependency=cause, history=hist,
            normal_from_minute=normal_from_minute(hist, ever),
            reason=_reason(graph, n, cause, direct, first)))
    return out

def _reason(graph, n, cause, direct, first):
    if first is None:
        return "No impact: dependencies stayed adequately supplied."
    if direct and (cause is None or first["nodes"][n]["own_health"] < 100 - EPS):
        return "Directly affected by the configured incident."
    if cause:
        src = graph.nodes[cause["source"]]["name"]
        return f"{src} ({cause['dependency_type']} dependency, strength {cause['strength']}) supplied only {cause['supply']:.0f}%, costing {cause['loss']:.0f} capacity points."
    return "Running on its local reserve to bridge a short supply deficit."

def cascade(graph, impacts):
    by = {i["node_id"]: i for i in impacts}
    order = list(graph.nodes)
    affected = sorted([i for i in impacts if i["first_impact_minute"] is not None], key=lambda i: (i["first_impact_minute"], order.index(i["node_id"])))
    depth, path, roots = {}, [], []
    for i in affected:
        c = i["responsible_dependency"]
        p = c["source"] if c else None
        if i["direct_incident"] and (c is None or i["first_impact_minute"] == min(a["first_impact_minute"] for a in affected if a["direct_incident"])):
            if p is None or p not in depth:
                depth[i["node_id"]] = 0; roots.append(i["node_id"]); continue
        if p in depth:
            depth[i["node_id"]] = depth[p] + 1
            path.append(dict(source=p, target=i["node_id"], minute=i["first_impact_minute"], dependency_type=c["dependency_type"],
                             loss=c["loss"], depth=depth[i["node_id"]], label=f"{graph.nodes[p]['name']} → {i['name']}"))
        else:
            depth[i["node_id"]] = 0; roots.append(i["node_id"])
    return path, roots, (max(depth.values()) if depth else 0)

def summarize(graph, config, tl, impacts, path, roots, depth):
    peak = max(tl, key=lambda s: s["impact_score"])
    final = tl[-1]
    first_d = min(config["disruptions"], key=lambda d: d["start_minute"])
    sevs = [d["severity"] for d in config["disruptions"]]
    dept = [i for i in impacts if i["category"] == "department"]
    return dict(overall_impact=peak["impact_score"], peak_minute=peak["minute"], final_impact=final["impact_score"],
        affected_count=sum(1 for i in impacts if i["peak_status"] != "healthy"),
        affected_departments=sum(1 for i in dept if i["peak_status"] != "healthy"),
        total_systems=len(impacts), unaffected_count=sum(1 for i in impacts if i["peak_status"] == "healthy"),
        peak_critical=max(s["counts"]["critical"] for s in tl), final_counts=final["counts"], cascade_depth=depth,
        initial_failure=dict(node_id=first_d["target"], name=graph.nodes[first_d["target"]]["name"], type=first_d["type"]),
        severity=max(sevs, key=["moderate", "high", "critical"].index), duration_minutes=config["duration_minutes"],
        severity_distribution={s: sum(1 for i in impacts if i["peak_status"] == s) for s in RANK})

def resources_view(config, tl):
    used = ie.total_cost(config["interventions"])
    pools = {}
    for k in CONSUMABLE_POOLS:
        av = config["resources"][k]
        pools[k] = dict(label=RESOURCES[k]["label"], unit=RESOURCES[k]["unit"], available=av, used=used.get(k, 0), remaining=av - used.get(k, 0))
    b = tl[-1]["backup"]
    return dict(pools=pools, generator=dict(fuel_hours=config["resources"]["generator_fuel_hours"], used_hours=b["fuel_used_hours"], remaining_pct=b["fuel_remaining_pct"]))

def explanation(graph, config, impacts, path, roots, summary):
    name = lambda n: graph.nodes[n]["name"]
    aff = [i for i in impacts if i["peak_status"] != "healthy"]
    ok = [i["name"] for i in impacts if i["peak_status"] == "healthy"]
    first = [f"{name(d['target'])} ({d['type'].replace('_', ' ')}, {d['severity']}, T+{d['start_minute']})" for d in config["disruptions"]]
    why = [f"{i['name']}: {i['reason']}" for i in sorted(aff, key=lambda i: (i["first_impact_minute"], -i['criticality'])) if not (i["direct_incident"] and i["node_id"] in roots)]
    resp = [dict(edge=p["label"], dependency_type=p["dependency_type"], minute=p["minute"], loss=p["loss"]) for p in path]
    crit = [i["name"] for i in aff if i["peak_status"] == "critical"]
    head = (f"Peak simulated impact {summary['overall_impact']:.0f}% at T+{summary['peak_minute']} min; {summary['affected_count']} of {summary['total_systems']} systems affected, cascade depth {summary['cascade_depth']}.")
    return dict(headline=head, what_failed_first=first, affected_systems=[f"{i['name']} ({i['peak_status'].replace('_', ' ')})" for i in aff],
                why=why, dependencies_responsible=resp, remain_operational=ok,
                critical_systems=crit, note="All statements are derived from the simulated model; they are not clinical predictions.")

def recovery_view(config, impacts, tl):
    aff = [i for i in impacts if i["first_impact_minute"] is not None]
    still = [i["name"] for i in aff if i["final_status"] != "healthy"]
    last = tl[-1]["nodes"]
    recovering = [i["name"] for i in aff if last[i["node_id"]]["recovery_state"] == "recovering"]
    normal = [i["name"] for i in aff if i["final_status"] == "healthy"]
    has_fix = any(d.get("resolution_minutes") is not None for d in config["disruptions"]) or config["interventions"]
    est = max((i["normal_from_minute"] for i in aff), default=None) if aff and not still else None
    note = "Recovery figures are model outputs under the stated assumptions, not real-world guarantees."
    if not has_fix and still:
        note += " No root-cause resolution or intervention was configured, so recovery cannot be assessed within this horizon."
    return dict(enabled=bool(has_fix), systems_still_affected=still, systems_recovering=recovering, systems_returned_to_normal=normal,
                estimated_full_recovery_minute=est, note=note)

def intervention_views(config, tl):
    out = []
    for i in config["interventions"]:
        by = tl[min(i["at_minute"] // 5, len(tl) - 1)]
        after = tl[min(i["effective_minute"] // 5 + 3, len(tl) - 1)]
        changes = [dict(node=n, from_status=by["nodes"][n]["status"], to_status=after["nodes"][n]["status"],
                        from_capacity=by["nodes"][n]["capacity"], to_capacity=after["nodes"][n]["capacity"])
                   for n in by["nodes"] if abs(by["nodes"][n]["capacity"] - after["nodes"][n]["capacity"]) >= 1 or by["nodes"][n]["status"] != after["nodes"][n]["status"]]
        out.append(dict(**i, before=dict(minute=by["minute"], impact_score=by["impact_score"], counts=by["counts"]),
                        after=dict(minute=after["minute"], impact_score=after["impact_score"], counts=after["counts"]), changes=changes))
    return out
