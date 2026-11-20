"""Recovery assumptions: a disruption with `resolution_minutes` has its root cause fixed;
the capacity loss at its target then shrinks by `points_per_step` each step. Dependants
follow through normal propagation. These are model assumptions, not guarantees."""
from .scenario_definitions import SEVERITY_LOSS, STEP_MINUTES, INCIDENT_TYPES
EPS = 0.05

def disruption_loss(d, t, rate_override=None):
    if t < d["start_minute"]:
        return 0.0
    loss = SEVERITY_LOSS[d["severity"]]
    res = d.get("resolution_minutes")
    if res is not None:
        resolved_at = d["start_minute"] + res
        if t >= resolved_at:
            rate = rate_override or INCIDENT_TYPES[d["type"]]["recovery_points_per_step"]
            loss = max(0.0, loss - rate * ((t - resolved_at) // STEP_MINUTES + 1))
    return loss

def classify(prev_cap, cap, on_buffer, ever_impacted):
    if on_buffer:
        return "degraded"
    if cap >= 100 - EPS:
        return "recovered" if ever_impacted else "normal"
    return "recovering" if cap > prev_cap + EPS else "degraded"

def normal_from_minute(history, ever_impacted):
    """First minute from which the node stays healthy to the end (None if never impacted / never settles)."""
    if not ever_impacted or history[-1]["status"] != "healthy":
        return None
    m = history[-1]["minute"]
    for h in reversed(history):
        if h["status"] != "healthy":
            break
        m = h["minute"]
    return m
