#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
schema = json.loads((ROOT / "protocol" / "famtutor.engine.runtime.v1.schema.json").read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, format_checker=FormatChecker())

validated = []
for path in sorted((ROOT / "examples").glob("*.json")):
    document = json.loads(path.read_text())
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))
    if errors:
        details = "\n".join(f"{list(error.absolute_path)}: {error.message}" for error in errors)
        raise RuntimeError(f"{path.name} failed JSON Schema validation:\n{details}")
    validated.append(path.name)

print(f"Core JSON Schema smoke passed: {len(validated)} examples.")
