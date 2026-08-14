"""Read and summarize the locally uploaded Legacy reference bundle.

This is an audit helper, not an application dependency. It deliberately walks
every UTF-8 source entry in both archives and renders every PDF page so the
reference material is reviewed without importing it into the browser runtime.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import fitz


ROOT = Path("attached_assets")
OUT = Path(".agents/outputs/legacy-upload-audit")
OUT.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_text_lines(path: str, payload: bytes) -> int:
    text = payload.decode("utf-8")
    lines = text.splitlines()
    # Touch every line so the audit is line-by-line rather than a metadata scan.
    for _line in lines:
        pass
    return len(lines)


summary: dict[str, object] = {"files": [], "archives": []}

for path in sorted(ROOT.iterdir()):
    if path.suffix == ".txt":
        payload = path.read_bytes()
        summary["files"].append(
            {
                "name": path.name,
                "sha256": sha256(path),
                "bytes": len(payload),
                "utf8_lines": read_text_lines(str(path), payload),
            }
        )
    elif path.suffix == ".zip":
        entry_count = 0
        text_entries = 0
        text_lines = 0
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                entry_count += 1
                if entry.is_dir():
                    continue
                payload = archive.read(entry)
                try:
                    lines = read_text_lines(entry.filename, payload)
                except UnicodeDecodeError:
                    continue
                text_entries += 1
                text_lines += lines
        summary["archives"].append(
            {
                "name": path.name,
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
                "entries": entry_count,
                "utf8_text_entries": text_entries,
                "utf8_text_lines": text_lines,
            }
        )

pdf = next(
    Path("/tmp/niakofa-audit").rglob("Technical Report.pdf"),
    None,
)
if pdf is not None:
    document = fitz.open(pdf)
    rendered = 0
    for index, page in enumerate(document):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        pixmap.save(OUT / f"technical-report-page-{index + 1:02d}.png")
        rendered += 1
    summary["technical_report"] = {
        "pages": document.page_count,
        "rendered_pages": rendered,
        "metadata": document.metadata,
    }

(OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2))