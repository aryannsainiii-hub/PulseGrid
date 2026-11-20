"""SQLite persistence (stdlib sqlite3). All SQL is isolated in this repository class so a move to
SQLAlchemy/PostgreSQL only touches this file."""
import json, os, sqlite3, uuid
from contextlib import contextmanager
from datetime import datetime, timezone

DEFAULT_DB = os.environ.get("PULSEGRID_DB", os.path.join(os.path.dirname(os.path.dirname(__file__)), "pulsegrid.db"))
SCHEMA = """
CREATE TABLE IF NOT EXISTS simulations(id TEXT PRIMARY KEY, name TEXT, scenario_id TEXT, created_at TEXT, parent_id TEXT, branch_label TEXT,
  severity TEXT, overall_impact REAL, affected_count INTEGER, best_strategy TEXT, config_json TEXT, result_json TEXT);
CREATE TABLE IF NOT EXISTS snapshots(simulation_id TEXT, minute INTEGER, snapshot_json TEXT, PRIMARY KEY(simulation_id, minute));
CREATE TABLE IF NOT EXISTS response_plans(id TEXT PRIMARY KEY, simulation_id TEXT, created_at TEXT, plan_json TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value_json TEXT);
"""
def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

class Repository:
    def __init__(self, path=None):
        self.path = path or DEFAULT_DB
        with self.conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def conn(self):
        c = sqlite3.connect(self.path)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()

    # settings / kv
    def get_kv(self, key, default=None):
        with self.conn() as c:
            r = c.execute("SELECT value_json FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(r["value_json"]) if r else default
    def set_kv(self, key, value):
        with self.conn() as c:
            c.execute("INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", (key, json.dumps(value)))
    def del_kv(self, key):
        with self.conn() as c:
            c.execute("DELETE FROM settings WHERE key=?", (key,))

    # simulations
    def save_simulation(self, result, parent_id=None, branch_label=None):
        sid, ts = new_id("sim"), now()
        r = {k: v for k, v in result.items() if k != "timeline"}
        with self.conn() as c:
            c.execute("INSERT INTO simulations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (sid, result["config"]["name"], result["config"].get("scenario_id"), ts, parent_id,
                branch_label, result["summary"]["severity"], result["summary"]["overall_impact"], result["summary"]["affected_count"], None,
                json.dumps(result["config"]), json.dumps(r)))
            c.executemany("INSERT INTO snapshots VALUES(?,?,?)", [(sid, s["minute"], json.dumps(s)) for s in result["timeline"]])
        return sid
    def get_simulation(self, sid):
        with self.conn() as c:
            row = c.execute("SELECT * FROM simulations WHERE id=?", (sid,)).fetchone()
            if not row: return None
            snaps = c.execute("SELECT snapshot_json FROM snapshots WHERE simulation_id=? ORDER BY minute", (sid,)).fetchall()
        res = json.loads(row["result_json"])
        res.update(id=row["id"], created_at=row["created_at"], parent_id=row["parent_id"], branch_label=row["branch_label"],
                   best_strategy=row["best_strategy"], name=row["name"], timeline=[json.loads(s["snapshot_json"]) for s in snaps])
        return res
    def list_simulations(self):
        with self.conn() as c:
            rows = c.execute("SELECT id,name,scenario_id,created_at,parent_id,branch_label,severity,overall_impact,affected_count,best_strategy FROM simulations").fetchall()
        return [dict(r) for r in rows]
    def set_best_strategy(self, sid, label):
        with self.conn() as c:
            c.execute("UPDATE simulations SET best_strategy=? WHERE id=?", (label, sid))
    def clear_simulations(self):
        with self.conn() as c:
            for t in ("snapshots", "response_plans", "simulations"):
                c.execute(f"DELETE FROM {t}")

    # plans
    def save_plan(self, sim_id, plan):
        pid = new_id("plan")
        with self.conn() as c:
            c.execute("INSERT INTO response_plans VALUES(?,?,?,?)", (pid, sim_id, now(), json.dumps(plan)))
        return pid
    def get_plan(self, pid):
        with self.conn() as c:
            r = c.execute("SELECT * FROM response_plans WHERE id=?", (pid,)).fetchone()
        return self._plan(r)
    def latest_plan_for(self, sim_id):
        with self.conn() as c:
            r = c.execute("SELECT * FROM response_plans WHERE simulation_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1", (sim_id,)).fetchone()
        return self._plan(r)
    @staticmethod
    def _plan(r):
        if not r: return None
        p = json.loads(r["plan_json"]); p.update(id=r["id"], simulation_id=r["simulation_id"], created_at=r["created_at"]); return p
