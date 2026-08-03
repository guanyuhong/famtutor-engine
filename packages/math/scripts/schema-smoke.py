#!/usr/bin/env python3
"""Validate published JSON contracts and every shipped example."""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
schema_path = ROOT / "protocol" / "famtutor.math.document.v1.schema.json"
tools_path = ROOT / "protocol" / "famtutor.math.agent-tools.v1.json"
schema = json.loads(schema_path.read_text())
tools = json.loads(tools_path.read_text())

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

for tool in tools["tools"]:
    Draft202012Validator.check_schema(tool["inputSchema"])

print(f"JSON Schema smoke passed: {len(validated)} examples and {len(tools['tools'])} Agent tool input schemas.")
