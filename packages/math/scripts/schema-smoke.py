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

operations_path = ROOT / "protocol" / "famtutor.math.operations.v1.schema.json"
operations = json.loads(operations_path.read_text())
Draft202012Validator.check_schema(operations)
ops_validator = Draft202012Validator(operations, format_checker=FormatChecker())

positive_ops = [
    {"op": "construct", "command": "point.free", "outputs": ["A"], "params": {"coords": [0, 0]}},
    {"op": "expand_macro", "macro": "triangle.centroid", "inputs": {"a": "A", "b": "B", "c": "C"}, "outputs": {"g": "G"}},
    {"op": "set_params", "nodeId": "op-A", "patch": {"coords": [1, 1]}},
    {"op": "set_entity", "entityId": "A", "patch": {"label": "A'"}},
    {"op": "delete", "targets": ["A"]},
    {"op": "delete", "target": "A"},
    {"op": "add_assertion", "assertion": {"id": "a1", "kind": "equal_length", "left": "AB", "right": "CD"}},
    {"op": "remove_assertion", "assertionId": "a1"},
    {"op": "set_style", "targets": ["A"], "style": {"color": "#f00"}},
    {"op": "set_interaction", "policy": {"target": "A", "permissions": ["drag"]}},
    {"op": "set_view", "viewId": "main", "patch": {"grid": True}},
]
for sample in positive_ops:
    errors = sorted(ops_validator.iter_errors(sample), key=lambda error: list(error.absolute_path))
    if errors:
        raise RuntimeError(f"positive op failed: {sample}: {errors[0].message}")

negative_ops = [
    {"op": "delete"},
    {"op": "delete", "targets": []},
    {"op": "construct"},
    {"op": "set_params"},
]
for sample in negative_ops:
    errors = list(ops_validator.iter_errors(sample))
    if not errors:
        raise RuntimeError(f"negative op unexpectedly valid: {sample}")

for tool in tools["tools"]:
    Draft202012Validator.check_schema(tool["inputSchema"])

print(f"JSON Schema smoke passed: {len(validated)} examples, operations schema, and {len(tools['tools'])} Agent tool input schemas.")
