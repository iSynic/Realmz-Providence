"""Exercise discovery over the real persistent adapter protocol in a disposable project."""
import argparse
import json
import subprocess
import time


from adapter_test_client import Adapter
import verify_discovery_flow as flow


def step(adapter, source, slot, code, target):
    family = "action-point" if source.startswith("action-point:") else "extra-action-point"
    adapter.request(family + ".step.apply", {"edit": {"source": source, "slot": slot,
        "actionIdentity": f"realmz.action.{code}", "targetNativeId": target}})


def populate(adapter):
    adapter.request("map.create", {"levelType": "land"})
    adapter.request("action-point.create", {"mapIdentity": "land:0", "x": 4, "y": 5})
    adapter.request("message.create", {"nativeId": 349, "text": "The eastern gate opens.\nThe guards step aside."})
    for identity in [12, 40, 90, 91]: adapter.request("extra-action-point.create", {"nativeId": identity})
    step(adapter, "extra-action-point:12", 0, 47, 9)
    step(adapter, "extra-action-point:12", 1, 39, 40)
    step(adapter, "extra-action-point:40", 0, 1, 349)
    step(adapter, "extra-action-point:91", 0, 47, -9)
    step(adapter, "extra-action-point:91", 1, 39, 90)
    step(adapter, "extra-action-point:90", 0, 39, 91)
    rows = adapter.request("action-point.list", {"mapIdentity":"land:0", "limit": 128})["items"]
    source = rows[0]["identity"]
    step(adapter, source, 0, 39, 12)
    adapter.request("quest-label.upsert", {"questLabel": {"id": 9, "label": "Eastern gate opened",
        "note": "Set by the gatekeeper.\nChecked before entering the courtyard."}})
    complex_result = adapter.request("encounter.create-complex")
    encounter = complex_result["document"]["encounter"]
    adapter.request("extra-code.upsert", {"row": {"nativeId": 0, "values": [9, 1, 0, 40, 0]}})
    encounter["thief"] = True
    encounter["thiefSuccess"] = 0
    encounter["promptMessageNativeId"] = 349
    encounter["actions"] = [{"slot": 8, "rawOpcode": 46, "targetNativeId": 0},
        {"slot":16, "rawOpcode":39, "targetNativeId":995}]
    adapter.request("encounter.update-complex", {"encounter": encounter})
    adapter.request("monster.create", {"setId": 0, "nativeId": 7})
    adapter.request("encounter.create-rogue")


def verify(adapter):
    flow.verify(adapter)
    for query in ["string 349", "str:349", "guards step aside"]:
        result = adapter.request("discovery.search", {"query": query})
        assert result["items"][0]["record"]["identity"] == "message:349", result
    callers = adapter.request("discovery.links", {"direction": "incoming", "kind": "message", "id": "349"})
    assert len(callers["items"]) >= 2, callers
    checks = adapter.request("quest.flow", {"id": 9, "role": "checks"})
    changes = adapter.request("quest.flow", {"id": 9, "role": "changes"})
    assert checks["total"] == 1 and changes["total"] == 2, (checks, changes)
    assert checks["items"][0]["condition"] == "Quest is set (nonzero)", checks
    assert {row["effect"] for row in changes["items"]} == {"Set", "Clear"}
    trace = adapter.request("discovery.trace", {"kind": "extra-action-point", "id": "40"})
    assert any(row["link"]["rootReason"] for row in trace["trace"]["items"]), trace
    cycle = adapter.request("discovery.trace", {"kind": "extra-action-point", "id": "90"})
    assert any(row["cycle"] for row in cycle["trace"]["items"]), cycle
    old_revision = adapter.context["revision"]
    step(adapter, "extra-action-point:12", 0, 47, -9)
    assert all(row["effect"] == "Clear" for row in adapter.request("quest.flow", {"id": 9, "role": "changes"})["items"])
    adapter.request("discovery.search", {"query": "gate", "expectedRevision": old_revision}, failure=True)
    adapter.request("history.undo")
    assert any(row["effect"] == "Set" for row in adapter.request("quest.flow", {"id": 9, "role": "changes"})["items"])
    adapter.request("history.redo")
    adapter.request("project.save")


def populate_paging(adapter, include_branch=True):
    for native_id in range(100, 300):
        adapter.request("extra-action-point.create", {"nativeId": native_id})
        step(adapter, f"extra-action-point:{native_id}", 0, 47, 12)
    if include_branch:
        adapter.request("extra-action-point.create", {"nativeId": 300})
        adapter.request("extra-code.upsert", {"row": {"nativeId": 1, "values": [10, 1, 0, 12, 0]}})
        adapter.request("extra-action-point.step.apply", {"edit": {"source":"extra-action-point:300", "slot":0,
            "actionIdentity":"realmz.action.46", "targetNativeId":1,
            "settings":{"values":{"testA":10,"testB":1,"branchMode":0,"target":12,"slot":0}}}})
    page = adapter.request("quest.flow", {"id":12, "role":"changes", "origin":"extra-action-point:299|actions[0]"})
    assert page["originFound"] and page["offset"] == 192 and page["total"] == 200
    nodes, edges, page = flow.collect(adapter, "quest:12")
    assert page["limitReached"] and not page["complete"] and len(nodes) == 200
    timing = flow.profile(adapter, [{"identity": "quest:12", "scope": "scenario"}])
    assert timing["withinBudget"], timing
    print(json.dumps({"kind": "dense-flow-timing", **timing}), flush=True)
    adapter.request("project.save")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("adapter")
    parser.add_argument("project")
    args = parser.parse_args()
    started = time.perf_counter()
    adapter = Adapter(args.adapter, args.project)
    try:
        populate(adapter)
        verify(adapter)
    finally:
        adapter.close()
    reopened = Adapter(args.adapter, args.project)
    try:
        assert all(row["effect"] == "Clear" for row in reopened.request("quest.flow", {"id": 9, "role": "changes"})["items"])
        assert reopened.request("discovery.search", {"query": "courtyard"})["total"] == 1
        populate_paging(reopened)
    finally:
        reopened.close()
    print(json.dumps({"kind": "discovery-adapter-receipt", "freshCommands": True,
        "connectedFlow": "AP > XAP setter > XAP message; Complex result > Quest > setters",
        "history": "Apply Undo Redo Save Reopen", "seconds": round(time.perf_counter() - started, 3)}))


if __name__ == "__main__": main()
