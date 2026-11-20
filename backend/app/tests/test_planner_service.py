import os, tempfile, unittest
from app.engine.runner import run_simulation
from app.engine.response_planner import build_plan
from app.engine.comparison_engine import compare
from app.database import Repository
from app.services.simulation_service import PulseGridService, NotFound
from app.services.settings_service import validate_settings
from app.engine.scenario_builder import ScenarioValidationError

POWER = {"disruptions": [{"type": "main_power_failure", "severity": "high"}]}
def plan(**res):
    return build_plan(run_simulation({**POWER, "resources": res})["config"])

class PlannerTests(unittest.TestCase):
    def test_three_strategies_ranked_and_reproducible(self):
        p = plan(); self.assertEqual([s["key"] for s in p["strategies"]], ["A", "B", "C"])
        self.assertEqual(p, plan())
        self.assertEqual(sorted(s["rank"] for s in p["strategies"]), [1, 2, 3])
        self.assertEqual(p["best_strategy"], next(s["key"] for s in p["strategies"] if s["rank"] == 1))
    def test_never_allocates_beyond_limits_and_marks_infeasible(self):
        p = plan(portable_generator_units=1)
        for k in ("B", "C"):
            s = next(x for x in p["strategies"] if x["key"] == k)
            self.assertFalse(s["feasible"]); self.assertIsNone(s["rank"]); self.assertEqual(s["hard_violations"][0]["resource"], "portable_generator_units")
        self.assertEqual(p["best_strategy"], "A")
    def test_no_feasible_strategy_means_no_recommendation(self):
        p = plan(portable_generator_units=0, surge_staff=0, alt_supply_requests=0)
        self.assertIsNone(p["best_strategy"]); self.assertIn("No strategy is feasible", p["explanation"])
    def test_score_formula(self):
        p = plan(); w = p["weights"]
        for s in p["strategies"]:
            c = s["components"]; raw = c["coverage_term"] - c["resource_penalty"] - c["recovery_penalty"] - c["violation_penalty"]
            self.assertAlmostEqual(raw, s["raw_score"], places=3)
            lo, hi = -(w["resources"] + w["recovery"] + w["violations"]), w["coverage"]
            self.assertAlmostEqual(100 * (raw - lo) / (hi - lo), s["score"], delta=0.2)
    def test_weights_change_ranking_inputs(self):
        cfg = run_simulation(POWER)["config"]
        a = build_plan(cfg, {"resources": 0.0}); b = build_plan(cfg, {"resources": 1.0})
        self.assertNotEqual([s["score"] for s in a["strategies"]], [s["score"] for s in b["strategies"]])
    def test_disclaimer_present(self):
        self.assertIn("human review", plan()["disclaimer"])
    def test_other_incident_types_plan(self):
        for t in ("oxygen_supply_disruption", "network_outage", "staff_shortage"):
            p = build_plan(run_simulation({"disruptions": [{"type": t, "severity": "high"}]})["config"])
            self.assertTrue(any(s["feasible"] for s in p["strategies"]), t)

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.path = os.path.join(self.tmp, "t.db")
        self.svc = PulseGridService(Repository(self.path))
    def test_dashboard_baseline_and_after_run(self):
        d = self.svc.dashboard(); self.assertEqual(d["kpis"]["operational_systems"], 14); self.assertEqual(d["kpis"]["active_incidents"], 0)
        self.svc.run(POWER); d = self.svc.dashboard()
        self.assertLess(d["kpis"]["operational_systems"], 14); self.assertEqual(d["kpis"]["active_incidents"], 1); self.assertEqual(len(d["recent_simulations"]), 1)
    def test_persistence_survives_new_service_instance(self):
        sid = self.svc.run(POWER)["id"]
        again = PulseGridService(Repository(self.path)).get(sid)
        self.assertEqual(len(again["timeline"]), 13); self.assertIsNotNone(again["plan"]); self.assertTrue(again["best_strategy"])
        self.assertEqual(again["summary"], self.svc.get(sid)["summary"])
    def test_replay_is_identical_and_baseline_untouched(self):
        a, b = self.svc.run(POWER), self.svc.run(POWER)
        self.assertEqual(a["timeline"], b["timeline"])
    def test_branching_keeps_parent(self):
        parent = self.svc.run(POWER)
        cfg = {**parent["config"], "interventions": [{"type": "prioritise_critical_loads", "at_minute": 30}]}
        child = self.svc.run(cfg, parent_id=parent["id"], branch_label="With prioritisation")
        self.assertEqual(child["parent_id"], parent["id"])
        self.assertEqual(self.svc.get(parent["id"])["config"]["interventions"], [])
        c = self.svc.compare([parent["id"], child["id"]])
        self.assertTrue(c["config_diffs"][0]["changes"]); self.assertEqual(len(c["runs"]), 2)
        self.assertLess(c["runs"][1]["final_impact"], c["runs"][0]["final_impact"])
    def test_unknown_parent_and_ids(self):
        with self.assertRaises(NotFound): self.svc.run(POWER, parent_id="nope")
        with self.assertRaises(NotFound): self.svc.get("nope")
    def test_invalid_run_not_saved(self):
        with self.assertRaises(ScenarioValidationError): self.svc.run({"disruptions": []})
        self.assertEqual(self.svc.list(), [])
    def test_list_search_filter_sort(self):
        self.svc.run(POWER); self.svc.run({"name": "Net", "disruptions": [{"type": "network_outage", "severity": "moderate"}]})
        self.assertEqual(len(self.svc.list(q="net")), 1); self.assertEqual(len(self.svc.list(severity="high")), 1)
        imp = [r["overall_impact"] for r in self.svc.list(sort="overall_impact", order="asc")]; self.assertEqual(imp, sorted(imp))
    def test_clear_history_and_reset(self):
        self.svc.run(POWER); self.svc.settings.update({"default_duration_minutes": 30})
        self.svc.clear_history(); self.assertEqual(self.svc.list(), []); self.assertEqual(self.svc.dashboard()["kpis"]["active_incidents"], 0)
        self.svc.run(POWER); self.svc.reset_demo()
        self.assertEqual(self.svc.list(), []); self.assertEqual(self.svc.settings.get()["default_duration_minutes"], 60)
    def test_settings_validation_and_effect(self):
        with self.assertRaises(ScenarioValidationError): validate_settings({"weights": {"coverage": 2}})
        self.svc.settings.update({"default_duration_minutes": 30})
        self.assertEqual(self.svc.run(POWER)["config"]["duration_minutes"], 30)
    def test_scenarios_data_driven(self):
        s = self.svc.scenarios(); self.assertEqual(len(s), 6)
        self.assertIn("icu", [n["id"] for n in s[0]["potentially_affected"]])
        self.assertEqual(self.svc.scenario("network_outage")["id"], "network_outage")
    def test_compare_requires_two(self):
        with self.assertRaises(ScenarioValidationError): self.svc.compare([self.svc.run(POWER)["id"]])
if __name__ == "__main__": unittest.main()
