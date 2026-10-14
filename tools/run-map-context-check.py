"""Run native map context checks against an owned disposable project."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import shutil


def contact_sheet(captures, destination):
    from PIL import Image, ImageDraw
    names = ["ap-sidebar-1600x900", "applied-player-sidebar", "applied-region-sidebar", "ap-window", "applied-player-window", "region-window", "flow-window"]
    paths = [captures / (name + ".png") for name in names if (captures / (name + ".png")).exists()]
    if not paths:
        raise RuntimeError("Native review produced no captures")
    cards = []
    for path in paths:
        image = Image.open(path).convert("RGB")
        image.thumbnail((420, 850))
        cards.append((path.stem, image.copy()))
    columns = 3
    row_heights = [max(image.height for _, image in cards[index:index + columns]) + 28 for index in range(0, len(cards), columns)]
    sheet = Image.new("RGB", (columns * 432, sum(row_heights)), "#0e151c")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for index, (label, image) in enumerate(cards):
        x = (index % columns) * 432
        y = sum(row_heights[:index // columns])
        draw.text((x + 8, y + 6), label, fill="white")
        sheet.paste(image, (x, y + 28))
    sheet.save(destination)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--cli", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--native", action="store_true")
    parser.add_argument("--path", default="godot")
    parser.add_argument("--source-project")
    parser.add_argument("--design-references")
    parser.add_argument("--review-frames", action="store_true")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="map-context-project-", dir=output) as work:
        env = os.environ.copy()
        env["PROVIDENCE_ADAPTER_PATH"] = str(Path(args.adapter).resolve())
        env["PROVIDENCE_CLI_PATH"] = str(Path(args.cli).resolve())
        env["PROVIDENCE_CONTEXT_TEST_PROJECT"] = str(Path(work) / "project")
        env.pop("PROVIDENCE_PROJECT_PATH", None)
        if args.source_project:
            source = Path(args.source_project).resolve()
            initial = Path(work) / "initial-project"
            initial.mkdir()
            shutil.copyfile(source / "project.providence.json", initial / "project.providence.json")
            shutil.copytree(source / "blobs", initial / "blobs")
            env["PROVIDENCE_PROJECT_PATH"] = str(initial)
        command = [args.godot]
        if not args.native:
            command += ["--headless"]
        else:
            captures = Path(work) / "captures"
            captures.mkdir()
            env["PROVIDENCE_CONTEXT_CAPTURE_ROOT"] = str(captures)
            command += ["--rendering-method", "gl_compatibility"]
        command += ["--path", args.path, "--script", "res://tools/validate_map_context_tools.gd", "--", "--demo"]
        result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=130)
        log = result.stdout + result.stderr
        (output / "context-tests.log").write_text(log, encoding="utf-8")
        if result.returncode or "ERROR:" in log or "PROVIDENCE_MAP_CONTEXT_TOOLS_OK" not in log:
            print(log[-7000:])
            raise SystemExit(1)
        if args.native:
            contact_sheet(captures, output / "native-contact-sheet.png")
            if args.review_frames:
                frames = output / "review-frames"
                frames.mkdir(exist_ok=True)
                for capture in sorted(captures.glob("*.png"))[:20]:
                    shutil.copyfile(capture, frames / capture.name)
            if args.design_references:
                references = Path(args.design_references).resolve()
                references.mkdir(parents=True, exist_ok=True)
                for name in ["ap-window", "applied-player-window", "applied-player-sidebar", "region-window"]:
                    image = captures / (name + ".png")
                    if image.exists():
                        shutil.copyfile(image, references / ("map-context-" + name + ".png"))
        print(log.strip())


if __name__ == "__main__":
    main()
