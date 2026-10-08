"""Read-only flow protocol checks shared by synthetic and imported discovery jobs."""
import math
import time


def collect(adapter, identity, scope="scenario", **options):
    params = {"root": {"identity": identity, "scope": scope}, **options}
    nodes, edges = {}, {}
    for _ in range(100):
        reply = adapter.request("discovery.flow", params)
        page = reply["graph"]
        assert len(page["nodes"]) <= 64 and len(page["edges"]) <= 128
        assert page["inspected"] <= 4096
        for target, rows in [(nodes, page["nodes"]), (edges, page["edges"])]:
            for row in rows:
                assert row["id"] not in target, row["id"]
                target[row["id"]] = row
        assert page["nodesTotal"] == len(nodes) <= 200
        assert page["edgesTotal"] == len(edges) <= 600
        if not reply["cursor"]:
            assert page["complete"] or page["limitReached"]
            assert all(e["source"] in nodes and e["target"] in nodes for e in edges.values())
            return nodes, edges, page
        params["cursor"] = reply["cursor"]
    raise AssertionError("Flow continuation failed to finish")


def verify(adapter):
    before = adapter.request("session.describe")
    nodes, edges, page = collect(adapter, "extra-action-point:40")
    assert "message:349" in {n["selection"]["identity"] for n in nodes.values()}
    assert any(e["reference"]["source"] == "extra-action-point:12" for e in edges.values())
    assert page["complete"]
    _, quest_edges, _ = collect(adapter, "quest:9")
    assert {"state-check", "state-change"} <= {e["relationship"] for e in quest_edges.values()}
    _, filtered, _ = collect(adapter, "quest:9", categories=["calls"])
    assert not filtered
    adapter.request("discovery.flow", {"root": {"identity": "quest:9"}, "projectId": "wrong"}, failure=True)
    assert before == adapter.request("session.describe")


def profile(adapter, records, samples=30):
    before = adapter.request("session.describe")
    timings = []
    cold = None
    for i in range(samples):
        record = records[i % len(records)]
        started = time.perf_counter()
        reply = adapter.request("discovery.flow", {"root": {
            "identity": record["identity"], "scope": record["scope"]}})
        elapsed = (time.perf_counter() - started) * 1000
        if cold is None:
            cold = elapsed
        else:
            timings.append(elapsed)
        assert len(reply["graph"]["nodes"]) <= 64 and len(reply["graph"]["edges"]) <= 128
    assert before == adapter.request("session.describe")
    p95 = sorted(timings)[math.ceil(len(timings) * .95) - 1]
    return {"firstFlowMs": round(cold, 2), "warmFlowP95Ms": round(p95, 2),
            "samples": len(timings), "budgetMs": 100, "withinBudget": p95 < 100}
