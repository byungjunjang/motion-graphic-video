"""Generate Codex entry points from the two public production workflows."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ("motion-video", "motion-catalog")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report missing or stale entries")
    args = parser.parse_args()
    stale = []
    for name in WORKFLOWS:
        source = Path(".claude/skills") / name / "SKILL.md"
        document = (ROOT / source).read_text(encoding="utf-8")
        header, end, _ = document.partition("\n---\n")
        if not header.startswith("---\n") or not end:
            raise ValueError(f"Missing skill frontmatter in {source}")
        target = ROOT / ".agents" / "skills" / name / "SKILL.md"
        content = (
            f"{header}{end}\n"
            f"Read repository-root `AGENTS.md` and `{source.as_posix()}` in full. "
            "Follow the canonical workflow and resolve its references from its original directory.\n"
        )
        if target.is_file() and target.read_text(encoding="utf-8") == content:
            continue
        if args.check:
            stale.append(str(target.relative_to(ROOT)))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content.encode("utf-8"))
    if stale:
        raise SystemExit("Run python scripts/sync_codex_skills.py to update:\n" + "\n".join(stale))


if __name__ == "__main__":
    main()
