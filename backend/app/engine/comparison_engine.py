"""Side-by-side comparison of saved simulations (inputs are saved result dicts, optionally with a 'plan')."""
RANK = {"healthy": 0, "at_risk": 1, "critical": 2}

def _flat(prefix, v, out):
    if isinstance(v, dict):
        for k in sorted(v): _flat(f"{prefix}.{k}" if prefix else k, v[k], out)
    else:
        out[prefix] = v

def config_diff(a, b):
    fa, fb = {}, {}
    for k in ("duration_minutes", "disruptions", "interventions", "resources", "recovery"):
        _flat(k, a["config"].get(k), fa); _flat(k, b["config"].get(k), fb)
        if isinstance(a["config"].get(k), list):
            fa[k] = [dict(x) for x in a["config"][k]]; fb[k] = [dict(x) for x in b["config"][k]]
            for key in [kk for kk in list(fa) + list(fb) if kk.startswith(k + ".")]:
                fa.pop(key, None); fb.pop(key, None)
    return [dict(field=k, base=fa.get(k), other=fb.get(k)) for k in sorted(set(fa) | set(fb)) if fa.get(k) != fb.get(k)]

def compare(results):
    if len(results) < 2:
        raise ValueError("select at least two simulations")
    runs = []
    for r in results:
        s, plan = r["summary"], r.get("plan")
        best = next((x for x in plan["strategies"] if x["key"] == plan["best_strategy"]), None) if plan else None
        runs.append(dict(id=r["id"], name=r["name"], branch_label=r.get("branch_label"), overall_impact=s["overall_impact"], final_impact=s["final_impact"],
            affected_count=s["affected_count"], affected_departments=s["affected_departments"], cascade_depth=s["cascade_depth"],
            severity_distribution=s["severity_distribution"], duration_minutes=s["duration_minutes"],
            resources_used={k: v["used"] for k, v in r["resources"]["pools"].items()},
            resource_use_total=sum(v["used"] for v in r["resources"]["pools"].values()),
            generator_fuel_used_hours=r["resources"]["generator"]["used_hours"],
            recovery_minute=r["recovery"]["estimated_full_recovery_minute"], still_affected=r["recovery"]["systems_still_affected"],
            best_strategy=(best["name"] + " – " + best["title"]) if best else None, best_score=best["score"] if best else None,
            strategy_scores={x["key"]: (x["score"] if x["feasible"] else None) for x in plan["strategies"]} if plan else None))
    minutes = sorted({s["minute"] for r in results for s in r["timeline"]})
    series = [dict(minute=m, **{r["id"]: next((s["impact_score"] for s in r["timeline"] if s["minute"] == m), None) for r in results}) for m in minutes]
    nodes = []
    for ni in results[0]["node_impacts"]:
        n = ni["node_id"]
        row = dict(node_id=n, name=ni["name"], category=ni["category"], values={})
        for r in results:
            x = next(i for i in r["node_impacts"] if i["node_id"] == n)
            row["values"][r["id"]] = dict(final_status=x["final_status"], peak_status=x["peak_status"], final_capacity=x["final_capacity"], first_impact_minute=x["first_impact_minute"])
        row["differs"] = len({(v["final_status"], round(v["final_capacity"])) for v in row["values"].values()}) > 1
        nodes.append(row)
    base = results[0]
    diffs = [dict(id=r["id"], vs=base["id"], changes=config_diff(base, r)) for r in results[1:]]
    return dict(runs=runs, impact_series=series, nodes=nodes, config_diffs=diffs, explanation=_explain(runs, nodes, diffs))
# }
def _explain(runs, nodes, diffs):
    lab = lambda r: r["branch_label"] or r["name"]
    out, b = [], runs[0]
    for r, d in zip(runs[1:], diffs):
        di = r["overall_impact"] - b["overall_impact"]
        worse = [n["name"] for n in nodes if n["differs"] and RANK[n["values"][r["id"]]["final_status"]] > RANK[n["values"][b["id"]]["final_status"]]]
        better = [n["name"] for n in nodes if n["differs"] and RANK[n["values"][r["id"]]["final_status"]] < RANK[n["values"][b["id"]]["final_status"]]]
        t = f"'{lab(r)}' vs '{lab(b)}': peak impact {di:+.1f} points, cascade depth {r['cascade_depth'] - b['cascade_depth']:+d}, affected systems {r['affected_count'] - b['affected_count']:+d}."
        if worse: t += f" Worse end state: {', '.join(worse)}."
        if better: t += f" Better end state: {', '.join(better)}."
        t += (" Assumption differences: " + "; ".join(f"{c['field']} {c['base']} → {c['other']}" for c in d["changes"][:6]) + ".") if d["changes"] else " Identical assumptions."
        out.append(t)
    return out
