#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent

SCHEMAS = {
    "runtime": (
        ROOT / "protocol" / "famtutor.engine.runtime.v1.schema.json",
        {
            "changeset.json",
            "diagnostic.json",
            "render-artifact.json",
            "runtime-descriptor.json",
        },
    ),
    "render-bundle": (
        ROOT / "protocol" / "famtutor.render.bundle.v1.schema.json",
        {"render-bundle.json"},
    ),
}

validated = []
for label, (schema_path, example_names) in SCHEMAS.items():
    schema = json.loads(schema_path.read_text())
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    for name in sorted(example_names):
        path = ROOT / "examples" / name
        document = json.loads(path.read_text())
        errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))
        if errors:
            details = "\n".join(f"{list(error.absolute_path)}: {error.message}" for error in errors)
            raise RuntimeError(f"{name} failed {label} JSON Schema validation:\n{details}")
        validated.append(f"{label}:{name}")

print(f"Core JSON Schema smoke passed: {len(validated)} examples.")
