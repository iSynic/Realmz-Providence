"""Persistent native adapter client for command-level integration checks."""
import json
import subprocess


class Adapter:
    def __init__(self, executable, project, library=None):
        arguments = [str(executable), "serve-project", str(project)]
        if library: arguments += ["--application-library-root", str(library)]
        self.process = subprocess.Popen(arguments,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8")
        self.serial = 0
        self.context = self.request("session.describe")

    def request(self, method, params=None, failure=False):
        self.serial += 1
        params = dict(params or {})
        if hasattr(self, "context"):
            params.setdefault("expectedRevision", self.context["revision"])
            params.setdefault("projectId", self.context["projectId"])
        self.process.stdin.write(json.dumps({"id": self.serial, "method": method, "params": params}) + "\n")
        self.process.stdin.flush()
        response = json.loads(self.process.stdout.readline())
        assert response["id"] == self.serial, response
        if failure:
            assert not response["ok"], response
            return response
        assert response["ok"], (method, response)
        result = response["result"]
        if hasattr(self, "context"):
            change = result.get("change", result) if isinstance(result, dict) else {}
            if "revision" in change: self.context["revision"] = change["revision"]
        return result

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=20)
        assert self.process.returncode == 0, self.process.stderr.read()
