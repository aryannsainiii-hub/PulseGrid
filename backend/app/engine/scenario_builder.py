"""Validation and normalisation of scenario configurations."""
import copy
from .scenario_definitions import (INCIDENT_TYPES, SEVERITIES, MIN_DURATION, MAX_DURATION, STEP_MINUTES)
from ..seed.hospital_seed import RESOURCES
from . import intervention_engine as ie

class ScenarioValidationError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(f"{e['field']}: {e['message']}" for e in errors))

def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)

def default_resources():
    return {k: v["available"] for k, v in RESOURCES.items()}

def normalize_config(raw, default_duration=60, enforce_resource_limits=True):
    errs = []
    def err(f, m): errs.append({"field": f, "message": m})
    if not isinstance(raw, dict):
        raise ScenarioValidationError([{"field": "config", "message": "must be an object"}])
    name = raw.get("name") or "Custom scenario"
    if not isinstance(name, str) or len(name) > 80:
        err("name", "must be a string of at most 80 characters"); name = "Custom scenario"
    duration = raw.get("duration_minutes", default_duration)
    if not _is_int(duration) or not MIN_DURATION <= duration <= MAX_DURATION or duration % STEP_MINUTES:
        err("duration_minutes", f"must be an integer multiple of {STEP_MINUTES} between {MIN_DURATION} and {MAX_DURATION}")
        duration = default_duration
    ds, seen = [], set()
    rd = raw.get("disruptions")
    if not isinstance(rd, list) or not 1 <= len(rd) <= 5:
        err("disruptions", "provide between 1 and 5 disruptions")
        rd = []
    for i, d in enumerate(rd):
        f = f"disruptions[{i}]"
        if not isinstance(d, dict) or d.get("type") not in INCIDENT_TYPES:
            err(f, f"unknown incident type; choose from {list(INCIDENT_TYPES)}"); continue
        spec = INCIDENT_TYPES[d["type"]]
        sev = d.get("severity", "high")
        if sev not in SEVERITIES:
            err(f + ".severity", f"must be one of {SEVERITIES}")
        target = d.get("target") or spec["default_target"]
        if target not in spec["allowed_targets"]:
            err(f + ".target", f"must be one of {spec['allowed_targets']}")
        start = d.get("start_minute", 0)
        if not _is_int(start) or start < 0 or start % STEP_MINUTES or start >= duration:
            err(f + ".start_minute", f"must be a multiple of 5 before the end of the simulation ({duration} min)")
        res = d.get("resolution_minutes")
        if res is not None and (not _is_int(res) or res < STEP_MINUTES or res % STEP_MINUTES):
            err(f + ".resolution_minutes", "must be null or a positive multiple of 5")
        key = (d["type"], target, start)
        if key in seen:
            err(f, "duplicate disruption (same type, target and start)")
        seen.add(key)
        ds.append(dict(type=d["type"], severity=sev, target=target, start_minute=start, resolution_minutes=res))
    resources = default_resources()
    for k, v in (raw.get("resources") or {}).items():
        if k not in resources:
            err("resources." + k, "unknown resource pool")
        elif not isinstance(v, (int, float)) or isinstance(v, bool) or not 0 <= v <= 1000:
            err("resources." + k, "must be a number between 0 and 1000")
        else:
            resources[k] = v
    ivs = []
    for i, r in enumerate(raw.get("interventions") or []):
        n, e = ie.normalize(r, duration)
        for m in e: err(f"interventions[{i}]", m)
        if n: ivs.append(n)
    if enforce_resource_limits:
        for k, used in ie.total_cost(ivs).items():
            if used > resources.get(k, 0):
                err("interventions", f"resource constraint violated: {k} needs {used} but only {resources.get(k, 0)} available")
    rec = raw.get("recovery") or {}
    pps = rec.get("points_per_step")
    if pps is not None and (not _is_int(pps) or not 5 <= pps <= 100):
        err("recovery.points_per_step", "must be null or an integer between 5 and 100")
    if errs:
        raise ScenarioValidationError(errs)
    ivs.sort(key=lambda x: (x["at_minute"], x["type"]))
    return dict(name=name, scenario_id=raw.get("scenario_id"), duration_minutes=duration, disruptions=ds,
                resources=resources, interventions=ivs, recovery={"points_per_step": pps})
