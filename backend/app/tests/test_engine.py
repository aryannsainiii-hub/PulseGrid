import copy, unittest
from app.engine.hospital_graph import build_hospital_graph, validate_hospital_graph
from app.engine.runner import run_simulation
from app.engine.scenario_builder import normalize_config, ScenarioValidationError
from app.engine.scenario_definitions import INCIDENT_TYPES, SEVERITIES, SCENARIOS, scenario_to_config
import networkx as nx

def cfg(types=("main_power_failure",), sev="high", **kw):
    return {"disruptions": [{"type": t, "severity": sev} for t in types], **kw}
def final(r, n): return r["timeline"][-1]["nodes"][n]
def at(r, minute, n): return next(s for s in r["timeline"] if s["minute"] == minute)["nodes"][n]

class GraphTests(unittest.TestCase):
    def test_graph_builds_and_validates(self):
        g = build_hospital_graph()
        self.assertEqual(g.number_of_nodes(), 14)
        self.assertEqual(validate_hospital_graph(g), [])
    def test_dependencies_reference_real_nodes_and_cycle_exists(self):
        g = build_hospital_graph()
        self.assertTrue(all(u in g and v in g for u, v in g.edges))
        self.assertTrue(list(nx.simple_cycles(g)), "model should contain a cycle (hvac <-> it_network)")
    def test_validation_catches_bad_strength(self):
        g = build_hospital_graph(); g["power_dist"]["icu"]["dependency_strength"] = 1.7
        self.assertTrue(validate_hospital_graph(g))

class SimulationTests(unittest.TestCase):
    def test_all_incident_types_and_severities_run(self):
        for t in INCIDENT_TYPES:
            for s in SEVERITIES:
                r = run_simulation(cfg((t,), s))
                self.assertEqual(r["timeline"][0]["minute"], 0)
                self.assertGreater(r["summary"]["affected_count"], 0, (t, s))
    def test_severity_is_monotonic(self):
        impacts = [run_simulation(cfg(("main_power_failure",), s))["summary"]["overall_impact"] for s in SEVERITIES]
        self.assertEqual(impacts, sorted(impacts)); self.assertLess(impacts[0], impacts[-1])
    def test_moderate_power_failure_is_absorbed_by_generator(self):
        r = run_simulation(cfg(sev="moderate"))
        self.assertEqual(final(r, "icu")["status"], "healthy")
    def test_high_power_failure_cascades_to_critical_departments(self):
        r = run_simulation(cfg())
        for n in ("icu", "ed", "ot"): self.assertEqual(final(r, n)["status"], "critical")
        self.assertGreaterEqual(r["summary"]["cascade_depth"], 2)
        self.assertEqual(r["summary"]["initial_failure"]["node_id"], "main_power")
    def test_timing_follows_lagged_propagation(self):
        r = run_simulation(cfg())
        self.assertEqual(at(r, 0, "power_dist")["capacity"], 100)   # no impact at T+0
        self.assertTrue(at(r, 5, "power_dist")["on_buffer"])        # bridged by reserve
        self.assertEqual(at(r, 10, "power_dist")["capacity"], 65)   # 15 utility + 50 generator
        self.assertEqual(at(r, 15, "icu")["status"], "at_risk")     # on local reserve
    def test_redundant_sources_add_up(self):
        r = run_simulation(cfg(sev="critical"))                       # utility 0 + generator 50
        self.assertEqual(at(r, 10, "power_dist")["capacity"], 50)
    def test_generator_failure_alone_does_not_cascade(self):
        r = run_simulation(cfg(("backup_generator_failure",), "critical"))
        self.assertEqual(final(r, "icu")["status"], "healthy")
        self.assertEqual(final(r, "backup_gen")["status"], "critical")
    def test_multiple_simultaneous_disruptions_are_worse(self):
        single = run_simulation(cfg())["summary"]["overall_impact"]
        both = run_simulation({"disruptions": [{"type": "main_power_failure", "severity": "high"}, {"type": "backup_generator_failure", "severity": "critical"}]})
        self.assertGreater(both["summary"]["overall_impact"], single)
        self.assertEqual(at(both, 10, "power_dist")["capacity"], 15)  # generator contributes nothing
    def test_delayed_second_disruption(self):
        r = run_simulation({"disruptions": [{"type": "main_power_failure", "severity": "high"}, {"type": "oxygen_supply_disruption", "severity": "high", "start_minute": 20}]})
        self.assertEqual(at(r, 15, "oxygen_plant")["own_health"], 100.0)
        self.assertLess(at(r, 20, "oxygen_plant")["own_health"], 100)
    def test_distribution_fault_bypasses_generator(self):
        r = run_simulation({"disruptions": [{"type": "main_power_failure", "severity": "critical", "target": "power_dist"}]})
        self.assertEqual(at(r, 10, "main_power")["status"], "healthy")
        self.assertEqual(at(r, 10, "power_dist")["capacity"], 0)
    def test_cycles_terminate_and_are_stable(self):
        r = run_simulation(cfg(("network_outage",), "critical", duration_minutes=240))
        a, b = r["timeline"][-2]["nodes"]["hvac"]["capacity"], r["timeline"][-1]["nodes"]["hvac"]["capacity"]
        self.assertAlmostEqual(a, b, places=1)
    def test_capacity_thresholds(self):
        r = run_simulation(cfg(("network_outage",), "moderate"))
        node = build_hospital_graph().nodes["it_network"]
        cap = final(r, "it_network")["capacity"]
        # 60 from the direct loss, slightly lower because of the HVAC <-> network feedback cycle
        self.assertLess(cap, 60); self.assertGreater(cap, 55)
        self.assertEqual(final(r, "it_network")["status"], "at_risk")
        self.assertGreaterEqual(cap, node["minimum_operating_capacity"])
    def test_durations(self):
        for d in (15, 60, 240):
            self.assertEqual(len(run_simulation(cfg(duration_minutes=d))["timeline"]), d // 5 + 1)
    def test_repeatable(self):
        a, b = run_simulation(cfg(("main_power_failure", "oxygen_supply_disruption"))), run_simulation(cfg(("main_power_failure", "oxygen_supply_disruption")))
        self.assertEqual(a, b)
    def test_baseline_graph_not_mutated(self):
        run_simulation(cfg()); g = build_hospital_graph()
        self.assertTrue(all(d["capacity"] == 100.0 and d["current_status"] == "healthy" for _, d in g.nodes(data=True)))
    def test_fuel_exhaustion_constraint(self):
        r = run_simulation({**cfg(), "resources": {"generator_fuel_hours": 0.5}})
        self.assertEqual(final(r, "backup_gen")["capacity"], 0)
        self.assertGreater(r["summary"]["overall_impact"], run_simulation(cfg())["summary"]["overall_impact"])
    def test_scenario_library_runs(self):
        for s in SCENARIOS: run_simulation(scenario_to_config(s))
    def test_explanations_come_from_results(self):
        r = run_simulation(cfg())
        self.assertIn("Main Power Grid", r["explanation"]["what_failed_first"][0])
        self.assertIn("General Ward", " ".join(r["explanation"]["affected_systems"]))
        self.assertIn("Water Supply", r["explanation"]["remain_operational"] + [i["name"] for i in r["node_impacts"] if i["peak_status"] != "healthy"])

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.r = run_simulation({"disruptions": [{"type": "main_power_failure", "severity": "high", "resolution_minutes": 20}], "duration_minutes": 120})
    def test_systems_return_to_normal(self):
        self.assertEqual(final(self.r, "icu")["status"], "healthy")
        self.assertEqual(final(self.r, "icu")["recovery_state"], "recovered")
        self.assertIsNotNone(self.r["recovery"]["estimated_full_recovery_minute"])
        self.assertEqual(self.r["recovery"]["systems_still_affected"], [])
    def test_recovering_state_observed(self):
        states = {s["nodes"]["power_dist"]["recovery_state"] for s in self.r["timeline"]}
        self.assertIn("recovering", states)
    def test_unresolved_reports_limitation(self):
        r = run_simulation(cfg())
        self.assertFalse(r["recovery"]["enabled"]); self.assertTrue(any("cannot be determined" in l for l in r["limitations"]))

class InterventionTests(unittest.TestCase):
    base = cfg()
    def with_iv(self, at_min, t="prioritise_critical_loads", **p):
        return {**self.base, "interventions": [{"type": t, "at_minute": at_min, "params": p}]}
    def test_intervention_improves_and_reports_counterfactual(self):
        r = run_simulation(self.with_iv(20)); base = run_simulation(self.base)
        self.assertLess(r["summary"]["final_impact"], base["summary"]["final_impact"])
        self.assertEqual(r["counterfactual"]["final_impact_without"], base["summary"]["final_impact"])
        self.assertIn("Intensive Care Unit", r["counterfactual"]["improved"])
        self.assertTrue(r["interventions"][0]["changes"])
    def test_branch_prefix_identical_before_effect(self):
        r, base = run_simulation(self.with_iv(30)), run_simulation(self.base)
        for a, b in zip(r["timeline"], base["timeline"]):
            if a["minute"] < 35:  # effective at 35
                self.assertEqual(a["nodes"], b["nodes"])
    def test_earlier_intervention_not_worse(self):
        early, late = run_simulation(self.with_iv(0)), run_simulation(self.with_iv(40))
        self.assertLessEqual(early["summary"]["overall_impact"], late["summary"]["overall_impact"])
    def test_tradeoff_noncritical_curtailed(self):
        r = run_simulation(self.with_iv(0))
        self.assertTrue(final(r, "lab")["shed"] or final(r, "ward")["shed"] or final(r, "imaging")["shed"])
    def test_resource_limit_enforced(self):
        with self.assertRaises(ScenarioValidationError) as cm:
            run_simulation({**self.with_iv(0, "deploy_portable_generators", units=2), "resources": {"portable_generator_units": 1}})
        self.assertIn("resource constraint", str(cm.exception))
    def test_alt_supply_restores_source(self):
        r = run_simulation(self.with_iv(0, "activate_alternative_supply", node="main_power"))
        self.assertGreater(final(r, "main_power")["capacity"], 15)

class ValidationTests(unittest.TestCase):
    def bad(self, raw, field):
        with self.assertRaises(ScenarioValidationError) as cm: normalize_config(raw)
        self.assertTrue(any(field in e["field"] for e in cm.exception.errors), cm.exception.errors)
    def test_invalid_configs(self):
        self.bad({}, "disruptions"); self.bad({"disruptions": [{"type": "meteor"}]}, "disruptions[0]")
        self.bad(cfg(sev="extreme"), "severity"); self.bad(cfg(duration_minutes=7), "duration")
        self.bad({"disruptions": [{"type": "main_power_failure", "severity": "high", "target": "icu"}]}, "target")
        self.bad({"disruptions": [{"type": "main_power_failure", "severity": "high", "start_minute": 7}]}, "start_minute")
        self.bad({**cfg(), "resources": {"nope": 1}}, "resources")
        self.bad({**cfg(), "interventions": [{"type": "x", "at_minute": 0}]}, "interventions")
        self.bad({**cfg(), "interventions": [{"type": "prioritise_critical_loads", "at_minute": 999}]}, "interventions")
        self.bad({"disruptions": [{"type": "main_power_failure", "severity": "high"}] * 2}, "disruptions[1]")
        self.bad(cfg(("main_power_failure",) * 6), "disruptions")
if __name__ == "__main__": unittest.main()
