"""Deterministic, time-stepped dependency propagation.

For every node at step k:
  own_health      = product over active disruptions of (1 - loss) (+ restore interventions)
  for each dependency group g:  supply_g = min(100, sum(source_output(k-delay) * share/100) + boosts)
                                factor_g = 1 - strength * (1 - supply_g/100)
  dependency_cap  = 100 * product(factor_g)
  local reserve   : a dependency deficit shorter than buffer_minutes is bridged (status at_risk, capacity held)
  capacity        = own_health * dependency_cap / 100 (then optional curtailment by interventions)
Sources are read from step k - delay (delay >= 1 step), so cycles cannot loop.
"""
from .scenario_definitions import STEP_MINUTES
from .simulation_clock import SimulationClock
from . import intervention_engine as ie
from .recovery_engine import disruption_loss, classify, EPS

DEFAULT_DELAY_MINUTES = 5

def status_for(cap, node, on_buffer=False):
    if cap < node["minimum_operating_capacity"]:
        return "critical"
    if on_buffer or cap < node["at_risk_threshold"]:
        return "at_risk"
    return "healthy"

def _groups(graph, clock):
    out = {n: [] for n in graph.nodes}
    idx = {}
    for u, v, d in graph.edges(data=True):
        if d["dependency_type"] == "standby_trigger":
            continue
        key = (v, d.get("group") or f"{u}->{v}")
        if key not in idx:
            idx[key] = dict(key=key[1], dep_type=d["dependency_type"], strength=d["dependency_strength"], sources=[])
            out[v].append(idx[key])
        g = idx[key]
        g["strength"] = max(g["strength"], d["dependency_strength"])
        g["sources"].append(dict(source=u, share=d.get("share", 100.0),
                                 delay=clock.steps_for(d.get("delay_minutes", DEFAULT_DELAY_MINUTES))))
    return out

def run_timeline(graph, config):
    clock = SimulationClock(config["duration_minutes"])
    groups = _groups(graph, clock)
    nodes = list(graph.nodes)
    rate = config["recovery"].get("points_per_step")
    fuel_minutes = config["resources"]["generator_fuel_hours"] * 60
    base = {n: dict(output=100.0, capacity=100.0) for n in nodes}
    states, snapshots = [], []
    deficit_since = {n: None for n in nodes}
    impacted = {n: False for n in nodes}
    backup_minutes = 0
    committed_prev = {}
    for k, t in enumerate(clock.minutes):
        def lag(n, steps):
            j = k - steps
            return states[j][n] if j >= 0 else base[n]
        active = ie.active_effects(config["interventions"], t)
        cur, events = {}, []
        for n in nodes:
            node = graph.nodes[n]
            own = 100.0
            for d in config["disruptions"]:
                if d["target"] == n:
                    own *= (1 - disruption_loss(d, t, rate) / 100.0)
            if own < 100.0:
                own = min(100.0, own + ie.restore_for(active, n))
            causes, factor_prod = [], 1.0
            for g in groups[n]:
                supply = sum(lag(s["source"], s["delay"])["output"] * s["share"] / 100.0 for s in g["sources"])
                supply = min(100.0, supply)
                boost = ie.boost_for(active, n, g["dep_type"])
                eff = min(100.0, supply + boost)
                factor_prod *= 1 - g["strength"] * (1 - eff / 100.0)
                loss = g["strength"] * (100.0 - eff)
                if loss > EPS:
                    top = max(g["sources"], key=lambda s: s["share"] * (100 - lag(s["source"], s["delay"])["output"]))
                    causes.append(dict(source=top["source"], sources=[s["source"] for s in g["sources"]],
                                       dependency_type=g["dep_type"], strength=g["strength"],
                                       supply=round(eff, 1), loss=round(loss, 1), boosted=boost > 0))
            dep_cap = 100.0 * factor_prod
            on_buffer = False
            if dep_cap < 100 - EPS:
                if deficit_since[n] is None:
                    deficit_since[n] = t
                if node["buffer_minutes"] > 0 and t - deficit_since[n] < node["buffer_minutes"]:
                    on_buffer, dep_eff = True, 100.0
                else:
                    dep_eff = dep_cap
            else:
                deficit_since[n], dep_eff = None, dep_cap
            cap = own * dep_eff / 100.0
            shed = False
            lim = ie.cap_for(active, n)
            if lim is not None and cap < 100 - EPS and cap > lim:
                cap, shed = lim, True
            out = cap
            if node.get("standby_for"):
                trig = lag(node["standby_for"], clock.steps_for(node["activation_delay_minutes"]))["output"]
                is_active = trig < 100 - EPS
                if is_active:
                    backup_minutes += STEP_MINUTES
                exhausted = backup_minutes > fuel_minutes + EPS
                if exhausted:
                    cap = 0.0
                out = cap if (is_active and not exhausted) else 0.0
            if own < 100 - EPS or dep_cap < 100 - EPS or on_buffer:
                impacted[n] = True
            prev_cap = states[-1][n]["capacity"] if states else 100.0
            cur[n] = dict(capacity=round(cap, 2), output=round(out, 2), own_health=round(own, 2),
                          dependency_capacity=round(dep_eff, 2), on_buffer=on_buffer, shed=shed,
                          status=status_for(cap, node, on_buffer), demand=node["demand"],
                          served_demand=round(node["demand"] * cap / 100.0, 2), causes=sorted(causes, key=lambda c: -c["loss"]),
                          recovery_state=classify(prev_cap, cap, on_buffer, impacted[n]))
        states.append(cur)
        events += _events(graph, config, t, k, states, active)
        committed = ie.total_cost([i for i in config["interventions"] if i["at_minute"] <= t])
        wsum = sum(graph.nodes[n]["criticality"] for n in nodes)
        impact = sum(graph.nodes[n]["criticality"] * (100 - cur[n]["capacity"]) for n in nodes) / wsum
        counts = {s: sum(1 for n in nodes if cur[n]["status"] == s) for s in ("healthy", "at_risk", "critical")}
        snapshots.append(dict(minute=t, impact_score=round(impact, 2), counts=counts, nodes=cur, events=events_for(events, t),
                              active_interventions=[i["type"] for i in config["interventions"] if i["effective_minute"] <= t],
                              resources_committed=committed,
                              backup=dict(active=cur["backup_gen"]["output"] > 0, fuel_used_hours=round(backup_minutes / 60, 2),
                                          fuel_remaining_pct=round(max(0.0, 100 * (1 - backup_minutes / fuel_minutes)) if fuel_minutes else 0.0, 1))))
    return snapshots

def events_for(events, t):
    return [e for e in events if e["minute"] == t]

def _events(graph, config, t, k, states, active):
    ev, cur, prev = [], states[k], (states[k - 1] if k else None)
    name = lambda n: graph.nodes[n]["name"]
    for d in config["disruptions"]:
        if d["start_minute"] == t:
            ev.append(dict(minute=t, node=d["target"], kind="incident", text=f"Incident begins: {d['type'].replace('_', ' ')} ({d['severity']}) at {name(d['target'])}."))
        res = d.get("resolution_minutes")
        if res is not None and d["start_minute"] + res == t:
            ev.append(dict(minute=t, node=d["target"], kind="recovery", text=f"Root cause resolved at {name(d['target'])}; recovery phase begins."))
    for i in config["interventions"]:
        if i["effective_minute"] == t:
            ev.append(dict(minute=t, node=None, kind="intervention", text=f"Hypothetical intervention takes effect: {i['label']}."))
    if prev:
        for n, s in cur.items():
            p = prev[n]
            if s["on_buffer"] and not p["on_buffer"]:
                c = s["causes"][0] if s["causes"] else None
                ev.append(dict(minute=t, node=n, kind="buffer", text=f"{name(n)} is bridging a supply deficit on its local reserve" + (f" (from {name(c['source'])})." if c else ".")))
            if s["status"] != p["status"] and not s["on_buffer"]:
                c = s["causes"][0] if s["causes"] else None
                why = f" because {name(c['source'])} ({c['dependency_type']}) supplies {c['supply']:.0f}%" if c else " due to a direct incident" if s["own_health"] < 100 else ""
                worse = ["healthy", "at_risk", "critical"].index(s["status"]) > ["healthy", "at_risk", "critical"].index(p["status"])
                ev.append(dict(minute=t, node=n, kind="degrade" if worse else "improve",
                               text=f"{name(n)} {'drops to' if worse else 'improves to'} {s['status'].replace('_', ' ')} at {s['capacity']:.0f}% capacity{why}."))
        if cur["backup_gen"]["output"] > 0 and prev["backup_gen"]["output"] == 0:
            ev.append(dict(minute=t, node="backup_gen", kind="backup", text="Backup generator online."))
        if cur["backup_gen"]["capacity"] == 0 and prev["backup_gen"]["capacity"] > 0 and cur["backup_gen"]["own_health"] > 0:
            ev.append(dict(minute=t, node="backup_gen", kind="fuel", text="Generator fuel exhausted under the configured fuel assumption."))
    return ev
