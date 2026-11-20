from ..engine.scenario_builder import ScenarioValidationError

DEFAULT_SETTINGS = dict(default_duration_minutes=60, max_recovery_minutes=120, response_start_minute=10,
                        weights=dict(coverage=0.4, resources=0.3, recovery=0.3, violations=0.3),
                        display=dict(theme="warm", compact_tables=False))

def validate_settings(raw):
    errs = []
    def err(f, m): errs.append({"field": f, "message": m})
    s = {**DEFAULT_SETTINGS, **{k: v for k, v in (raw or {}).items() if k in DEFAULT_SETTINGS}}
    def int_in(k, lo, hi, step=5):
        v = s[k]
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi or v % step:
            err(k, f"must be an integer multiple of {step} between {lo} and {hi}")
    int_in("default_duration_minutes", 15, 240); int_in("max_recovery_minutes", 30, 240); int_in("response_start_minute", 0, 120)
    w = {**DEFAULT_SETTINGS["weights"], **(s.get("weights") or {})}
    for k in DEFAULT_SETTINGS["weights"]:
        if not isinstance(w.get(k), (int, float)) or isinstance(w.get(k), bool) or not 0 <= w[k] <= 1:
            err(f"weights.{k}", "must be a number between 0 and 1")
    d = {**DEFAULT_SETTINGS["display"], **(s.get("display") or {})}
    if d["theme"] not in ("warm", "light"): err("display.theme", "must be 'warm' or 'light'")
    if not isinstance(d["compact_tables"], bool): err("display.compact_tables", "must be boolean")
    if errs: raise ScenarioValidationError(errs)
    s["weights"], s["display"] = w, d
    return s

class SettingsService:
    def __init__(self, repo): self.repo = repo
    def get(self): return validate_settings(self.repo.get_kv("settings", {}))
    def update(self, raw):
        s = validate_settings(raw); self.repo.set_kv("settings", s); return s
    def reset(self): self.repo.del_kv("settings"); return self.get()
