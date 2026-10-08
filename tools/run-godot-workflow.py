"""Run an asynchronous native workflow with a wall-clock deadline."""

import argparse
import os
import signal
import subprocess
import sys


def stop_process_tree(process):
    # The Windows console executable launches the engine as a child process.
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()


def run(command, timeout):
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding="utf-8", errors="replace", **options)
    try:
        output, _ = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        stop_process_tree(process)
        output, _ = process.communicate(timeout=20)
        print(output, end="")
        print(f"Native workflow exceeded its {timeout:g}-second wall-clock deadline.", file=sys.stderr)
        return 124
    print(output, end="")
    return process.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.timeout <= 0 or not args.command:
        parser.error("A positive timeout and executable command are required")
    raise SystemExit(run(args.command, args.timeout))
