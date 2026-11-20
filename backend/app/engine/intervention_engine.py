"""Hypothetical interventions. Each one is a bundle of declarative effects that the
propagation engine evaluates statelessly at every step. Nothing here controls real equipment."""
CRITICAL_DEPTS = ["icu", "ed", "ot"]
NONCRITICAL_DEPTS = ["ward", "imaging", "lab"]
ALL = "*"

def _prioritise(p):
    return dict(boosts=[(CRITICAL_DEPTS, ALL, 20.0)], caps=[(NONCRITICAL_DEPTS, 50.0)], restores=[], cost={"surge_staff": 2})
def _portable(p):
    u = p["units"]
    return dict(boosts=[(["power_dist"], "power", 8.0 * u)], caps=[], restores=[], cost={"portable_generator_units": u})
def _oxygen(p):
    return dict(boosts=[(["icu", "ed", "ot", "ward"], "oxygen", 25.0)], caps=[], restores=[], cost={"oxygen_cylinder_sets": 3})
def _failover(p):
    return dict(boosts=[(ALL, "network", 50.0)], caps=[], restores=[], cost={"it_failover_links": 1})
def _staff(p):
    return dict(boosts=[], caps=[], restores=[("staffing", 25.0)], cost={"surge_staff": 4})
def _alt(p):
    return dict(boosts=[], caps=[], restores=[(p["node"], 40.0)], cost={"alt_supply_requests": 1})

INTERVENTIONS = {
 "prioritise_critical_loads": dict(label="Prioritise eligible critical loads", delay=5, build=_prioritise, params={},
     description="Route scarce supply to ICU, ED and OT first (+20 supply points); non-critical departments in deficit are curtailed to 50%."),
 "deploy_portable_generators": dict(label="Deploy portable generators", delay=10, build=_portable, params={"units": (1, 2, 2)},
     description="Each unit adds 8 supply points at Power Distribution."),
 "deploy_oxygen_cylinders": dict(label="Deploy oxygen cylinder sets", delay=5, build=_oxygen, params={},
     description="Adds 25 oxygen supply points to ICU, ED, OT and wards."),
 "activate_it_failover": dict(label="Activate IT failover link", delay=5, build=_failover, params={},
     description="Adds 50 network supply points to all dependants."),
 "activate_surge_staffing": dict(label="Activate surge staffing", delay=10, build=_staff, params={},
     description="Restores 25 points of clinical staffing availability."),
 "activate_alternative_supply": dict(label="Activate hypothetical alternative supply", delay=15, build=_alt,
     params={"node": ("choice", ["main_power", "backup_gen", "oxygen_plant", "it_network"], "main_power")},
     description="Hypothetical escalation restoring 40 availability points at a chosen source."),
}

def catalog():
    out = []
    for k, v in INTERVENTIONS.items():
        eff = v["build"](_defaults(v))
        out.append(dict(type=k, label=v["label"], description=v["description"], delay_minutes=v["delay"],
                        cost=eff["cost"], params={n: spec for n, spec in v["params"].items()}))
    return out

def _defaults(v):
    d = {}
    for n, spec in v["params"].items():
        d[n] = spec[2]
    return d

def normalize(raw, duration):
    """Return (normalized, errors)."""
    errs, t = [], raw.get("type") if isinstance(raw, dict) else None
    if t not in INTERVENTIONS:
        return None, [f"unknown intervention type '{t}'"]
    spec = INTERVENTIONS[t]
    at = raw.get("at_minute", 0)
    if not isinstance(at, int) or isinstance(at, bool) or at < 0 or at % 5 or at >= duration:
        errs.append(f"{t}: at_minute must be a multiple of 5 within [0, {duration - 5}]")
    params = {}
    given = raw.get("params") or {}
    for n, s in spec["params"].items():
        val = given.get(n, s[2])
        if s[0] == "choice":
            if val not in s[1]:
                errs.append(f"{t}: param '{n}' must be one of {s[1]}")
        elif not isinstance(val, int) or isinstance(val, bool) or not s[0] <= val <= s[1]:
            errs.append(f"{t}: param '{n}' must be an integer in [{s[0]}, {s[1]}]")
        params[n] = val
    if errs:
        return None, errs
    eff = spec["build"](params)
    return dict(type=t, label=spec["label"], at_minute=at, params=params,
                effective_minute=at + spec["delay"], cost=eff["cost"]), []

def effects(norm):
    return INTERVENTIONS[norm["type"]]["build"](norm["params"])

def active_effects(interventions, t):
    return [effects(i) for i in interventions if i["effective_minute"] <= t]

def boost_for(active, node, dep_type):
    total = 0.0
    for e in active:
        for nodes, dt, pts in e["boosts"]:
            if (nodes == ALL or node in nodes) and (dt == ALL or dt == dep_type):
                total += pts
    return total

def restore_for(active, node):
    return sum(p for e in active for n, p in e["restores"] if n == node)

def cap_for(active, node):
    caps = [c for e in active for nodes, c in e["caps"] if node in nodes]
    return min(caps) if caps else None

def total_cost(interventions):
    tot = {}
    for i in interventions:
        for k, v in i["cost"].items():
            tot[k] = tot.get(k, 0) + v
    return tot
