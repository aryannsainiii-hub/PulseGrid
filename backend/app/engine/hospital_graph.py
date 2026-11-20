import copy
import networkx as nx
from ..seed.hospital_seed import NODES, EDGES, RESOURCES

class GraphValidationError(ValueError):
    pass

def build_hospital_graph():
    """Fresh, isolated NetworkX DiGraph built from the synthetic seed (edge: source -> dependent)."""
    g = nx.DiGraph()
    for n in NODES:
        g.add_node(n["id"], **copy.deepcopy(n))
    for e in EDGES:
        attrs = {k: copy.deepcopy(v) for k, v in e.items() if k not in ("source", "target")}
        g.add_edge(e["source"], e["target"], **attrs)
    problems = validate_hospital_graph(g)
    if problems:
        raise GraphValidationError("; ".join(problems))
    return g

def validate_hospital_graph(g):
    problems = []
    for n, d in g.nodes(data=True):
        if d.get("category") not in ("infrastructure", "department"):
            problems.append(f"{n}: bad category")
        if not (0 <= d["minimum_operating_capacity"] < d["at_risk_threshold"] <= 100):
            problems.append(f"{n}: thresholds must satisfy 0 <= min < at_risk <= 100")
        if not 1 <= d["criticality"] <= 5:
            problems.append(f"{n}: criticality out of range")
    for u, v, d in g.edges(data=True):
        s = d["dependency_strength"]
        if d["dependency_type"] == "standby_trigger":
            if s != 0:
                problems.append(f"edge {u}->{v}: standby strength must be 0")
        elif not 0 < s <= 1:
            problems.append(f"edge {u}->{v}: strength must be in (0,1]")
        if not 0 <= d.get("share", 100) <= 100:
            problems.append(f"edge {u}->{v}: share out of range")
    return problems

def model_dict(g=None):
    g = g or build_hospital_graph()
    nodes = [dict(d) for _, d in g.nodes(data=True)]
    edges = [dict(source=u, target=v, **d) for u, v, d in g.edges(data=True)]
    return {"nodes": nodes, "edges": edges, "resources": copy.deepcopy(RESOURCES),
            "synthetic": True, "disclaimer": "Synthetic demo data. Not a real hospital."}

def downstream(g, node_id):
    """All nodes that can be affected by `node_id` (graph reachability)."""
    return sorted(nx.descendants(g, node_id))
