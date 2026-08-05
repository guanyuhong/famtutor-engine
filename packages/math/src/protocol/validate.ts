import {
  ENTITY_TYPES,
  type EntityType,
  type MathDocument,
  type ValidationIssue,
  type ValidationReport
} from "../types.js";
import {
  expectedInputType,
  getCommandDefinition,
  typeConstraintMatches
} from "../catalog/commands.js";
import { MathEngineError, asMathEngineError } from "../errors.js";
import { parseExpression } from "../expression/parser.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import { evaluateAssertions } from "../kernel/assertions.js";
import { ID_PATTERN, finiteNumber, isPlainObject } from "../util.js";

const TOP_LEVEL_KEYS = new Set([
  "schema", "documentId", "revision", "seed", "metadata", "entities", "construction", "views",
  "styles", "interactions", "controls", "clocks", "assertions", "activities", "provenance"
]);
const ENTITY_KEYS = new Set(["id", "type", "label", "role", "visible", "visibleWhen", "description"]);
const NODE_KEYS = new Set(["id", "command", "inputs", "params", "outputs", "description"]);
const INPUT_KEYS = new Set(["ref", "value"]);
const GRAPHICS_VIEW_KEYS = new Set([
  "id", "kind", "visible", "renderer", "boundingBox", "axes", "grid", "keepAspectRatio",
  "background", "cameraPolicy", "entityIds", "title"
]);
const GRAPHICS3D_VIEW_KEYS = new Set([
  "id", "kind", "visible", "renderer", "boundingBox3D", "camera", "projection", "axes",
  "background", "entityIds", "title"
]);
const SIMPLE_VIEW_KEYS = new Set(["id", "kind", "visible", "renderer", "title"]);
const STYLE_KEYS = new Set(["targets", "style"]);
const INTERACTION_KEYS = new Set(["target", "permissions", "dragMode", "dragTarget", "snap"]);
const CONTROL_KEYS = new Set(["id", "kind", "label", "action", "description"]);
const CLOCK_KEYS = new Set(["id", "target", "start", "end", "step", "intervalMs", "loop", "resetValue", "autoStart"]);
const ASSERTION_KEYS = new Set([
  "id", "predicate", "arguments", "expected", "tolerance", "requiredMethod", "severity", "message"
]);
const ENTITY_ROLES = new Set(["free", "derived", "auxiliary", "measurement", "annotation"]);
const VIEW_KINDS = new Set(["graphics2d", "graphics3d", "construction", "algebra"]);
const ASSERTION_PREDICATES = new Set([
  "expression_equal", "point_on", "collinear", "parallel", "perpendicular", "coincident",
  "equal_length", "equal_angle", "value_in_range"
]);

function issue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  message: string,
  options: Partial<Omit<ValidationIssue, "code" | "path" | "message" | "severity">> & { severity?: ValidationIssue["severity"] } = {}
): void {
  issues.push({
    code,
    path,
    message,
    severity: options.severity ?? "error",
    expected: options.expected,
    actual: options.actual,
    suggestedFixes: options.suggestedFixes,
    retryable: options.retryable ?? true
  });
}

function checkClosedObject(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(issues, "ADDITIONAL_PROPERTY", `${path}.${key}`, `Unsupported property '${key}'.`, { actual: key });
  }
}

function checkId(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || value.length > 128) {
    issue(issues, "INVALID_ID", path, "ID must match ^[A-Za-z][A-Za-z0-9._:-]*$ and be at most 128 characters.", {
      actual: typeof value === "string" ? value : String(value)
    });
    return false;
  }
  return true;
}

function checkNumberPair(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!Array.isArray(value) || value.length !== 2 || !finiteNumber(value[0]) || !finiteNumber(value[1])) {
    issue(issues, "INVALID_NUMBER_PAIR", path, "Expected [finiteNumber, finiteNumber].", { actual: value as never });
    return false;
  }
  return true;
}

function structuralValidation(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    issue(issues, "DOCUMENT_NOT_OBJECT", "$", "MathDocument must be a JSON object.", { actual: String(typeof value) });
    return issues;
  }
  checkClosedObject(value, TOP_LEVEL_KEYS, "$", issues);

  if (value.schema !== "famtutor.math.document.v1") {
    issue(issues, "INVALID_SCHEMA", "$.schema", "schema must equal 'famtutor.math.document.v1'.", { actual: String(value.schema) });
  }
  checkId(value.documentId, "$.documentId", issues);
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) {
    issue(issues, "INVALID_REVISION", "$.revision", "revision must be an integer >= 1.", { actual: value.revision as never });
  }
  if (!Number.isInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) > 2147483647) {
    issue(issues, "INVALID_SEED", "$.seed", "seed must be an integer in [0,2147483647].", { actual: value.seed as never });
  }

  if (!isPlainObject(value.metadata)) {
    issue(issues, "INVALID_METADATA", "$.metadata", "metadata must be an object.");
  } else {
    const allowed = new Set(["title", "description", "locale", "purpose", "subject", "grade", "tags"]);
    checkClosedObject(value.metadata, allowed, "$.metadata", issues);
    if (typeof value.metadata.title !== "string" || !value.metadata.title.trim()) issue(issues, "INVALID_TITLE", "$.metadata.title", "metadata.title is required.");
    if (typeof value.metadata.locale !== "string" || !value.metadata.locale.trim()) issue(issues, "INVALID_LOCALE", "$.metadata.locale", "metadata.locale is required.");
    if (!["exploration", "demonstration", "practice", "assessment", "authoring"].includes(String(value.metadata.purpose))) {
      issue(issues, "INVALID_PURPOSE", "$.metadata.purpose", "Unsupported metadata purpose.", { actual: String(value.metadata.purpose) });
    }
    if (value.metadata.tags !== undefined && (!Array.isArray(value.metadata.tags) || value.metadata.tags.some(tag => typeof tag !== "string"))) {
      issue(issues, "INVALID_TAGS", "$.metadata.tags", "metadata.tags must be an array of strings.");
    }
  }

  const entityIds = new Set<string>();
  const entityTypeById = new Map<string, EntityType>();
  if (!Array.isArray(value.entities)) {
    issue(issues, "INVALID_ENTITIES", "$.entities", "entities must be an array.");
  } else {
    value.entities.forEach((entity, index) => {
      const path = `$.entities[${index}]`;
      if (!isPlainObject(entity)) {
        issue(issues, "INVALID_ENTITY", path, "Entity must be an object.");
        return;
      }
      checkClosedObject(entity, ENTITY_KEYS, path, issues);
      const validId = checkId(entity.id, `${path}.id`, issues);
      if (validId) {
        const entityId = entity.id as string;
        if (entityIds.has(entityId)) issue(issues, "DUPLICATE_ENTITY_ID", `${path}.id`, `Duplicate entity ID '${entityId}'.`, { actual: entityId });
        entityIds.add(entityId);
      }
      if (!ENTITY_TYPES.includes(entity.type as EntityType)) {
        issue(issues, "INVALID_ENTITY_TYPE", `${path}.type`, "Unsupported entity type.", { expected: [...ENTITY_TYPES], actual: String(entity.type) });
      } else if (validId) {
        entityTypeById.set(entity.id as string, entity.type as EntityType);
      }
      if (!ENTITY_ROLES.has(String(entity.role))) issue(issues, "INVALID_ENTITY_ROLE", `${path}.role`, "Unsupported entity role.", { actual: String(entity.role) });
      if (entity.label !== undefined && typeof entity.label !== "string") issue(issues, "INVALID_LABEL", `${path}.label`, "label must be a string.");
      if (entity.visible !== undefined && typeof entity.visible !== "boolean") issue(issues, "INVALID_VISIBLE", `${path}.visible`, "visible must be boolean.");
    });
    value.entities.forEach((entity, index) => {
      if (!isPlainObject(entity) || entity.visibleWhen === undefined) return;
      const path = `$.entities[${index}].visibleWhen`;
      if (typeof entity.visibleWhen !== "string" || entityTypeById.get(entity.visibleWhen) !== "boolean") {
        issue(issues, "INVALID_VISIBILITY_CONDITION", path, "visibleWhen must reference a declared boolean entity.", { actual: String(entity.visibleWhen) });
      }
    });
  }

  const nodeIds = new Set<string>();
  const produced = new Map<string, string>();
  if (!Array.isArray(value.construction)) {
    issue(issues, "INVALID_CONSTRUCTION", "$.construction", "construction must be an array.");
  } else {
    value.construction.forEach((node, index) => {
      const path = `$.construction[${index}]`;
      if (!isPlainObject(node)) {
        issue(issues, "INVALID_NODE", path, "Construction node must be an object.");
        return;
      }
      checkClosedObject(node, NODE_KEYS, path, issues);
      const validId = checkId(node.id, `${path}.id`, issues);
      if (validId) {
        const nodeId = node.id as string;
        if (nodeIds.has(nodeId)) issue(issues, "DUPLICATE_NODE_ID", `${path}.id`, `Duplicate node ID '${nodeId}'.`, { actual: nodeId });
        nodeIds.add(nodeId);
      }
      if (typeof node.command !== "string") {
        issue(issues, "INVALID_COMMAND", `${path}.command`, "command must be a string.");
        return;
      }
      const definition = getCommandDefinition(node.command);
      if (!definition) {
        issue(issues, "UNKNOWN_COMMAND", `${path}.command`, `Unknown command '${node.command}'.`, { actual: node.command });
      }
      if (node.inputs !== undefined && !Array.isArray(node.inputs)) {
        issue(issues, "INVALID_INPUTS", `${path}.inputs`, "inputs must be an array.");
      } else {
        (node.inputs ?? []).forEach((input, inputIndex) => {
          const inputPath = `${path}.inputs[${inputIndex}]`;
          if (!isPlainObject(input)) {
            issue(issues, "INVALID_INPUT", inputPath, "Input must be {ref} or {value}.");
            return;
          }
          checkClosedObject(input, INPUT_KEYS, inputPath, issues);
          const hasRef = Object.hasOwn(input, "ref");
          const hasValue = Object.hasOwn(input, "value");
          if (hasRef === hasValue) {
            issue(issues, "INVALID_INPUT_UNION", inputPath, "Input must contain exactly one of ref or value.");
          } else if (hasRef) {
            if (!checkId(input.ref, `${inputPath}.ref`, issues)) return;
            if (!entityIds.has(input.ref)) issue(issues, "MISSING_INPUT_ENTITY", `${inputPath}.ref`, `Input entity '${input.ref}' is not declared.`, { actual: input.ref });
          }
        });
      }
      if (!Array.isArray(node.outputs) || node.outputs.length === 0) {
        issue(issues, "INVALID_OUTPUTS", `${path}.outputs`, "outputs must be a non-empty array of entity IDs.");
      } else {
        node.outputs.forEach((output, outputIndex) => {
          const outputPath = `${path}.outputs[${outputIndex}]`;
          if (!checkId(output, outputPath, issues)) return;
          if (!entityIds.has(output)) issue(issues, "UNDECLARED_OUTPUT_ENTITY", outputPath, `Output entity '${output}' is not declared.`, { actual: output });
          const previous = produced.get(output);
          if (previous) issue(issues, "MULTIPLE_ENTITY_PRODUCERS", outputPath, `Entity '${output}' is already produced by '${previous}'.`, { actual: output });
          else produced.set(output, typeof node.id === "string" ? node.id : path);
        });
      }
      if (node.params !== undefined && !isPlainObject(node.params)) issue(issues, "INVALID_PARAMS", `${path}.params`, "params must be an object.");

      if (definition) {
        const inputs = Array.isArray(node.inputs) ? node.inputs : [];
        const minInputs = definition.minInputs ?? definition.inputTypes.length;
        const maxInputs = definition.maxInputs ?? definition.inputTypes.length;
        if (inputs.length < minInputs || inputs.length > maxInputs) {
          issue(issues, "INPUT_COUNT_MISMATCH", `${path}.inputs`, `Command '${node.command}' expects ${minInputs === maxInputs ? minInputs : `${minInputs}..${maxInputs}`} inputs.`, {
            expected: minInputs === maxInputs ? minInputs : [minInputs, maxInputs],
            actual: inputs.length
          });
        }
        inputs.forEach((input, inputIndex) => {
          if (!isPlainObject(input) || typeof input.ref !== "string") return;
          const actualType = entityTypeById.get(input.ref);
          const expected = expectedInputType(definition, inputIndex);
          if (actualType && expected && !typeConstraintMatches(expected, actualType)) {
            issue(issues, "TYPE_MISMATCH", `${path}.inputs[${inputIndex}]`, `Command '${node.command}' input ${inputIndex + 1} has incompatible type '${actualType}'.`, {
              expected: Array.isArray(expected) ? [...expected] : String(expected),
              actual: actualType,
              suggestedFixes: [{ description: "Use an entity with one of the expected input types." }]
            });
          }
        });
        const outputs = Array.isArray(node.outputs) ? node.outputs : [];
        if (outputs.length !== definition.outputTypes.length) {
          issue(issues, "OUTPUT_COUNT_MISMATCH", `${path}.outputs`, `Command '${node.command}' expects ${definition.outputTypes.length} outputs.`, {
            expected: definition.outputTypes.length,
            actual: outputs.length
          });
        }
        outputs.forEach((output, outputIndex) => {
          if (typeof output !== "string") return;
          const actualType = entityTypeById.get(output);
          const expected = definition.outputTypes[outputIndex];
          if (actualType && expected && !typeConstraintMatches(expected, actualType)) {
            issue(issues, "OUTPUT_TYPE_MISMATCH", `${path}.outputs[${outputIndex}]`, `Output '${output}' has incompatible type '${actualType}'.`, {
              expected: Array.isArray(expected) ? [...expected] : String(expected),
              actual: actualType
            });
          }
        });
        for (const param of definition.requiredParams ?? []) {
          if (!isPlainObject(node.params) || !Object.hasOwn(node.params, param)) {
            issue(issues, "MISSING_PARAMETER", `${path}.params.${param}`, `Command '${node.command}' requires params.${param}.`);
          }
        }
        if (definition.expressionParams && isPlainObject(node.params)) {
          for (const expressionParam of definition.expressionParams) {
            const raw = node.params[expressionParam];
            if (typeof raw === "string") {
              try { parseExpression(raw); } catch (error) {
                const normalized = asMathEngineError(error, "EXPRESSION_PARSE_ERROR");
                issue(issues, normalized.code, `${path}.params.${expressionParam}`, normalized.message, { actual: raw });
              }
            }
          }
        }
        if (node.command === "circle.center_radius" && inputs.length === 1 && (!isPlainObject(node.params) || !Object.hasOwn(node.params, "radius"))) {
          issue(issues, "MISSING_PARAMETER", `${path}.params.radius`, "circle.center_radius needs either a scalar second input or params.radius.");
        }
        if (node.command === "boolean.constant" && (!isPlainObject(node.params) || typeof node.params.value !== "boolean")) {
          issue(issues, "INVALID_PARAMETER", `${path}.params.value`, "boolean.constant params.value must be boolean.", { actual: isPlainObject(node.params) ? node.params.value as never : undefined });
        }
      }
    });
  }

  for (const entityId of entityIds) {
    if (!produced.has(entityId)) issue(issues, "UNPRODUCED_ENTITY", `$.entities.${entityId}`, `Entity '${entityId}' has no producer.`, { actual: entityId });
  }

  if (!Array.isArray(value.views) || value.views.length === 0) {
    issue(issues, "INVALID_VIEWS", "$.views", "views must be a non-empty array.");
  } else {
    const viewIds = new Set<string>();
    value.views.forEach((view, index) => {
      const path = `$.views[${index}]`;
      if (!isPlainObject(view)) {
        issue(issues, "INVALID_VIEW", path, "View must be an object.");
        return;
      }
      const kind = String(view.kind);
      checkClosedObject(view, kind === "graphics2d" ? GRAPHICS_VIEW_KEYS : kind === "graphics3d" ? GRAPHICS3D_VIEW_KEYS : SIMPLE_VIEW_KEYS, path, issues);
      if (checkId(view.id, `${path}.id`, issues)) {
        if (viewIds.has(view.id)) issue(issues, "DUPLICATE_VIEW_ID", `${path}.id`, `Duplicate view ID '${view.id}'.`);
        viewIds.add(view.id);
      }
      if (!VIEW_KINDS.has(kind)) issue(issues, "INVALID_VIEW_KIND", `${path}.kind`, "Unsupported view kind.", { actual: kind });
      if (typeof view.visible !== "boolean") issue(issues, "INVALID_VIEW_VISIBLE", `${path}.visible`, "view.visible must be boolean.");
      if (kind === "graphics2d") {
        const box = view.boundingBox;
        if (!Array.isArray(box) || box.length !== 4 || box.some(item => !finiteNumber(item)) || (box[0] as number) >= (box[2] as number) || (box[3] as number) >= (box[1] as number)) {
          issue(issues, "INVALID_BOUNDING_BOX", `${path}.boundingBox`, "boundingBox must be [xmin,ymax,xmax,ymin] with positive extent.", { actual: box as never });
        }
        if (!["auto", "jsxgraph-svg", "jsxgraph-canvas", "direct-svg"].includes(String(view.renderer))) issue(issues, "INVALID_RENDERER", `${path}.renderer`, "Unsupported graphics renderer.");
        if (view.entityIds !== undefined && (!Array.isArray(view.entityIds) || view.entityIds.some(id => typeof id !== "string" || !entityIds.has(id)))) {
          issue(issues, "INVALID_VIEW_ENTITIES", `${path}.entityIds`, "entityIds must reference declared entities.");
        }
      } else if (kind === "graphics3d") {
        const box = view.boundingBox3D;
        if (!Array.isArray(box) || box.length !== 3 || box.some(range => !Array.isArray(range) || range.length !== 2 || !finiteNumber(range[0]) || !finiteNumber(range[1]) || range[0] >= range[1])) {
          issue(issues, "INVALID_BOUNDING_BOX_3D", `${path}.boundingBox3D`, "boundingBox3D must be [[xmin,xmax],[ymin,ymax],[zmin,zmax]] with positive finite extents.", { actual: box as never });
        }
        if (!['auto', 'jsxgraph-svg', 'jsxgraph-canvas', 'direct-svg'].includes(String(view.renderer))) issue(issues, "INVALID_RENDERER", `${path}.renderer`, "Unsupported graphics3d renderer.");
        if (view.projection !== undefined && !['parallel', 'central'].includes(String(view.projection))) issue(issues, "INVALID_PROJECTION", `${path}.projection`, "graphics3d projection must be parallel or central.");
        if (view.camera !== undefined) {
          if (!isPlainObject(view.camera) || !finiteNumber(view.camera.azimuth) || !finiteNumber(view.camera.elevation) || (view.camera.distance !== undefined && (!finiteNumber(view.camera.distance) || view.camera.distance <= 0))) {
            issue(issues, "INVALID_CAMERA_3D", `${path}.camera`, "camera requires finite azimuth/elevation radians and optional positive distance.");
          }
        }
        if (view.entityIds !== undefined && (!Array.isArray(view.entityIds) || view.entityIds.some(id => typeof id !== "string" || !entityIds.has(id)))) {
          issue(issues, "INVALID_VIEW_ENTITIES", `${path}.entityIds`, "entityIds must reference declared entities.");
        }
      } else if (view.renderer !== "auto") {
        issue(issues, "INVALID_RENDERER", `${path}.renderer`, `${kind} view renderer must be 'auto'.`);
      }
    });
  }

  if (value.styles !== undefined) {
    if (!Array.isArray(value.styles)) issue(issues, "INVALID_STYLES", "$.styles", "styles must be an array.");
    else value.styles.forEach((binding, index) => {
      const path = `$.styles[${index}]`;
      if (!isPlainObject(binding)) { issue(issues, "INVALID_STYLE_BINDING", path, "Style binding must be an object."); return; }
      checkClosedObject(binding, STYLE_KEYS, path, issues);
      if (!Array.isArray(binding.targets) || binding.targets.length === 0 || binding.targets.some(target => typeof target !== "string" || !entityIds.has(target))) {
        issue(issues, "INVALID_STYLE_TARGETS", `${path}.targets`, "Style targets must reference declared entities.");
      }
      if (!isPlainObject(binding.style)) issue(issues, "INVALID_STYLE", `${path}.style`, "style must be an object.");
    });
  }

  if (value.interactions !== undefined) {
    if (!Array.isArray(value.interactions)) issue(issues, "INVALID_INTERACTIONS", "$.interactions", "interactions must be an array.");
    else value.interactions.forEach((policy, index) => {
      const path = `$.interactions[${index}]`;
      if (!isPlainObject(policy)) { issue(issues, "INVALID_INTERACTION", path, "Interaction policy must be an object."); return; }
      checkClosedObject(policy, INTERACTION_KEYS, path, issues);
      if (typeof policy.target !== "string" || !entityIds.has(policy.target)) issue(issues, "INVALID_INTERACTION_TARGET", `${path}.target`, "Interaction target must reference a declared entity.");
      if (!Array.isArray(policy.permissions) || policy.permissions.some(permission => !["select", "drag", "edit", "set_value"].includes(String(permission)))) {
        issue(issues, "INVALID_PERMISSIONS", `${path}.permissions`, "Unsupported interaction permission.");
      }
      if (policy.dragTarget !== undefined && (typeof policy.dragTarget !== "string" || !entityIds.has(policy.dragTarget))) issue(issues, "INVALID_DRAG_TARGET", `${path}.dragTarget`, "dragTarget must reference a declared entity.");
    });
  }

  const clockIds = new Set<string>();
  const clockTargets = new Set<string>();
  if (value.clocks !== undefined) {
    if (!Array.isArray(value.clocks)) issue(issues, "INVALID_CLOCKS", "$.clocks", "clocks must be an array.");
    else value.clocks.forEach((clock, index) => {
      const path = `$.clocks[${index}]`;
      if (!isPlainObject(clock)) { issue(issues, "INVALID_CLOCK", path, "Clock must be an object."); return; }
      checkClosedObject(clock, CLOCK_KEYS, path, issues);
      const start = typeof clock.start === "number" ? clock.start : Number.NaN;
      const end = typeof clock.end === "number" ? clock.end : Number.NaN;
      const step = typeof clock.step === "number" ? clock.step : Number.NaN;
      const intervalMs = typeof clock.intervalMs === "number" ? clock.intervalMs : Number.NaN;
      if (checkId(clock.id, `${path}.id`, issues)) {
        if (clockIds.has(clock.id)) issue(issues, "DUPLICATE_CLOCK_ID", `${path}.id`, `Duplicate clock ID '${clock.id}'.`);
        clockIds.add(clock.id);
      }
      if (typeof clock.target !== "string" || entityTypeById.get(clock.target) !== "scalar") {
        issue(issues, "INVALID_CLOCK_TARGET", `${path}.target`, "Clock target must reference a declared scalar entity.");
      } else {
        const producerId = produced.get(clock.target);
        const producer = Array.isArray(value.construction)
          ? value.construction.find(node => isPlainObject(node) && node.id === producerId)
          : undefined;
        if (!producer || producer.command !== "scalar.slider") {
          issue(issues, "INVALID_CLOCK_TARGET", `${path}.target`, "Clock target must be produced by scalar.slider.", { actual: producer?.command as never });
        } else if (clockTargets.has(clock.target)) {
          issue(issues, "DUPLICATE_CLOCK_TARGET", `${path}.target`, "A scalar may be driven by at most one deterministic clock.", { actual: clock.target });
        } else {
          clockTargets.add(clock.target);
          const min = isPlainObject(producer.params) && typeof producer.params.min === "number" ? producer.params.min : Number.NaN;
          const max = isPlainObject(producer.params) && typeof producer.params.max === "number" ? producer.params.max : Number.NaN;
          if (finiteNumber(min) && finiteNumber(max) && (start < min || end > max)) {
            issue(issues, "CLOCK_OUTSIDE_SLIDER_RANGE", path, "Clock [start,end] must lie inside the target slider range.", { expected: [min, max], actual: [start, end] });
          }
        }
      }
      if (!finiteNumber(start) || !finiteNumber(end) || start >= end) {
        issue(issues, "INVALID_CLOCK_RANGE", path, "Clock requires finite start < end.");
      }
      if (!finiteNumber(step) || step <= 0 || (finiteNumber(end) && finiteNumber(start) && step > end - start)) {
        issue(issues, "INVALID_CLOCK_STEP", `${path}.step`, "Clock step must be positive and no larger than its range.");
      }
      if (!Number.isInteger(intervalMs) || intervalMs < 16 || intervalMs > 60_000) {
        issue(issues, "INVALID_CLOCK_INTERVAL", `${path}.intervalMs`, "Clock intervalMs must be an integer in [16, 60000].");
      }
      if (clock.loop !== undefined && !["none", "repeat", "alternate"].includes(String(clock.loop))) {
        issue(issues, "INVALID_CLOCK_LOOP", `${path}.loop`, "Clock loop must be none, repeat, or alternate.");
      }
      const resetValue = typeof clock.resetValue === "number" ? clock.resetValue : Number.NaN;
      if (clock.resetValue !== undefined && (!finiteNumber(resetValue) || resetValue < start || resetValue > end)) {
        issue(issues, "INVALID_CLOCK_RESET", `${path}.resetValue`, "Clock resetValue must lie inside [start,end].");
      }
      if (clock.autoStart !== undefined && typeof clock.autoStart !== "boolean") {
        issue(issues, "INVALID_CLOCK_AUTOSTART", `${path}.autoStart`, "Clock autoStart must be boolean.");
      }
    });
  }

  const stageIds = new Set<string>();
  if (Array.isArray(value.activities)) {
    for (const activity of value.activities) {
      if (!isPlainObject(activity) || !Array.isArray(activity.stages)) continue;
      for (const stage of activity.stages) if (isPlainObject(stage) && typeof stage.id === "string") stageIds.add(stage.id);
    }
  }
  const controlIds = new Set<string>();
  if (value.controls !== undefined) {
    if (!Array.isArray(value.controls)) issue(issues, "INVALID_CONTROLS", "$.controls", "controls must be an array.");
    else value.controls.forEach((control, index) => {
      const path = `$.controls[${index}]`;
      if (!isPlainObject(control)) { issue(issues, "INVALID_CONTROL", path, "Control must be an object."); return; }
      checkClosedObject(control, CONTROL_KEYS, path, issues);
      if (checkId(control.id, `${path}.id`, issues)) {
        if (controlIds.has(control.id)) issue(issues, "DUPLICATE_CONTROL_ID", `${path}.id`, `Duplicate control ID '${control.id}'.`);
        controlIds.add(control.id);
      }
      if (!["button", "checkbox"].includes(String(control.kind))) issue(issues, "INVALID_CONTROL_KIND", `${path}.kind`, "Control kind must be button or checkbox.");
      if (typeof control.label !== "string" || !control.label.trim()) issue(issues, "INVALID_CONTROL_LABEL", `${path}.label`, "Control label is required.");
      if (!isPlainObject(control.action)) { issue(issues, "INVALID_CONTROL_ACTION", `${path}.action`, "Control action must be an object."); return; }
      const action = control.action;
      const actionType = String(action.type);
      const allowedActionTypes = ["scalar.set", "boolean.set", "boolean.toggle", "stage.set", "clock.play", "clock.pause", "clock.reset", "clock.step"];
      if (!allowedActionTypes.includes(actionType)) {
        issue(issues, "INVALID_CONTROL_ACTION", `${path}.action.type`, "Unsupported control action.", { actual: actionType });
        return;
      }
      if (control.kind === "checkbox" && actionType !== "boolean.toggle") issue(issues, "INVALID_CHECKBOX_ACTION", `${path}.action.type`, "A checkbox must use boolean.toggle.");
      const allowedActionKeys = actionType === "scalar.set"
        ? new Set(["type", "target", "value"])
        : actionType === "boolean.set" ? new Set(["type", "target", "value"])
        : actionType === "stage.set" ? new Set(["type", "stageId"]) : new Set(["type", "target"]);
      checkClosedObject(action, allowedActionKeys, `${path}.action`, issues);
      if (actionType === "scalar.set") {
        if (typeof action.target !== "string" || entityTypeById.get(action.target) !== "scalar") issue(issues, "INVALID_CONTROL_TARGET", `${path}.action.target`, "scalar.set must target a scalar.");
        if (!finiteNumber(action.value)) issue(issues, "INVALID_CONTROL_VALUE", `${path}.action.value`, "scalar.set value must be finite.");
        if (typeof action.target === "string" && finiteNumber(action.value)) {
          const producerId = produced.get(action.target);
          const producer = Array.isArray(value.construction)
            ? value.construction.find(node => isPlainObject(node) && node.id === producerId)
            : undefined;
          const min = isPlainObject(producer?.params) && typeof producer.params.min === "number" ? producer.params.min : Number.NaN;
          const max = isPlainObject(producer?.params) && typeof producer.params.max === "number" ? producer.params.max : Number.NaN;
          if (finiteNumber(min) && finiteNumber(max) && (action.value < min || action.value > max)) {
            issue(issues, "CONTROL_VALUE_OUTSIDE_SLIDER_RANGE", `${path}.action.value`, "scalar.set value must lie inside the target slider range.", { expected: [min, max], actual: action.value });
          }
        }
      } else if (actionType === "boolean.set" || actionType === "boolean.toggle") {
        if (typeof action.target !== "string" || entityTypeById.get(action.target) !== "boolean") issue(issues, "INVALID_CONTROL_TARGET", `${path}.action.target`, `${actionType} must target a boolean.`);
        if (actionType === "boolean.set" && typeof action.value !== "boolean") issue(issues, "INVALID_CONTROL_VALUE", `${path}.action.value`, "boolean.set value must be boolean.");
        if (typeof action.target === "string") {
          const producerId = produced.get(action.target);
          const producer = Array.isArray(value.construction)
            ? value.construction.find(node => isPlainObject(node) && node.id === producerId)
            : undefined;
          if (!producer || producer.command !== "boolean.constant") issue(issues, "INVALID_CONTROL_TARGET", `${path}.action.target`, `${actionType} must target boolean.constant.`, { actual: producer?.command as never });
        }
      } else if (actionType === "stage.set") {
        if (typeof action.stageId !== "string" || !stageIds.has(action.stageId)) issue(issues, "INVALID_CONTROL_STAGE", `${path}.action.stageId`, "stage.set must reference a declared activity stage.");
      } else if (typeof action.target !== "string" || !clockIds.has(action.target)) {
        issue(issues, "INVALID_CONTROL_CLOCK", `${path}.action.target`, "Clock action must reference a declared clock.");
      }
    });
  }

  if (value.assertions !== undefined) {
    if (!Array.isArray(value.assertions)) issue(issues, "INVALID_ASSERTIONS", "$.assertions", "assertions must be an array.");
    else {
      const assertionIds = new Set<string>();
      value.assertions.forEach((assertion, index) => {
        const path = `$.assertions[${index}]`;
        if (!isPlainObject(assertion)) { issue(issues, "INVALID_ASSERTION", path, "Assertion must be an object."); return; }
        checkClosedObject(assertion, ASSERTION_KEYS, path, issues);
        if (checkId(assertion.id, `${path}.id`, issues)) {
          if (assertionIds.has(assertion.id)) issue(issues, "DUPLICATE_ASSERTION_ID", `${path}.id`, `Duplicate assertion ID '${assertion.id}'.`);
          assertionIds.add(assertion.id);
        }
        if (!ASSERTION_PREDICATES.has(String(assertion.predicate))) issue(issues, "INVALID_PREDICATE", `${path}.predicate`, "Unsupported assertion predicate.", { actual: String(assertion.predicate) });
        if (!Array.isArray(assertion.arguments)) issue(issues, "INVALID_ASSERTION_ARGUMENTS", `${path}.arguments`, "Assertion arguments must be an array.");
        else assertion.arguments.forEach((argument, argumentIndex) => {
          const argumentPath = `${path}.arguments[${argumentIndex}]`;
          if (!isPlainObject(argument)) { issue(issues, "INVALID_ASSERTION_ARGUMENT", argumentPath, "Assertion argument must be {ref}, {expr}, or {value}."); return; }
          const discriminants = [Object.hasOwn(argument, "ref"), Object.hasOwn(argument, "expr"), Object.hasOwn(argument, "value")].filter(Boolean).length;
          if (discriminants !== 1) issue(issues, "INVALID_ASSERTION_ARGUMENT_UNION", argumentPath, "Assertion argument needs exactly one of ref, expr, or value.");
          if (typeof argument.ref === "string" && !entityIds.has(argument.ref)) issue(issues, "MISSING_ASSERTION_ENTITY", `${argumentPath}.ref`, `Unknown assertion entity '${argument.ref}'.`);
          if (typeof argument.expr === "string") {
            try { parseExpression(argument.expr); } catch (error) {
              const normalized = asMathEngineError(error, "EXPRESSION_PARSE_ERROR");
              issue(issues, normalized.code, `${argumentPath}.expr`, normalized.message, { actual: argument.expr });
            }
          }
        });
        if (assertion.tolerance !== undefined && (!finiteNumber(assertion.tolerance) || assertion.tolerance < 0)) issue(issues, "INVALID_TOLERANCE", `${path}.tolerance`, "tolerance must be a non-negative finite number.");
      });
    }
  }

  return issues;
}

export function validateMathDocument(value: unknown): ValidationReport {
  const issues = structuralValidation(value);
  if (issues.some(current => current.severity === "error")) {
    return { status: "invalid", issues, assertionEvidence: [], undefinedEntities: [] };
  }

  const document = value as MathDocument;
  let graph;
  try {
    graph = buildConstructionGraph(document);
  } catch (error) {
    const normalized = asMathEngineError(error, "CONSTRUCTION_GRAPH_ERROR");
    issues.push(normalized.toIssue("error"));
    return { status: "invalid", issues, assertionEvidence: [], undefinedEntities: [] };
  }

  const evaluation = evaluateMathDocument(document);
  issues.push(...evaluation.issues);
  const assertionEvidence = evaluateAssertions(document, evaluation);
  for (const evidence of assertionEvidence) {
    if (evidence.status === "failed" || evidence.status === "undefined" || evidence.status === "unverified") {
      const assertion = (document.assertions ?? []).find(item => item.id === evidence.assertionId);
      issues.push({
        code: evidence.status === "unverified" ? "ASSERTION_METHOD_UNVERIFIED" : "ASSERTION_FAILED",
        severity: assertion?.severity ?? "error",
        path: `$.assertions.${evidence.assertionId}`,
        message: evidence.message ?? `Assertion '${evidence.assertionId}' is ${evidence.status}.`,
        actual: evidence.status,
        retryable: true
      });
    }
  }
  const undefinedEntities = [...evaluation.entities.values()].filter(entity => !entity.defined).map(entity => entity.id);
  const hasErrors = issues.some(current => current.severity === "error");
  const status: ValidationReport["status"] = hasErrors ? "invalid" : undefinedEntities.length || issues.length ? "partial" : "valid";
  return {
    status,
    issues,
    assertionEvidence,
    undefinedEntities,
    graph: { nodeOrder: graph.order, edges: graph.edges }
  };
}

export function assertValidMathDocument(value: unknown): MathDocument {
  const report = validateMathDocument(value);
  if (report.status !== "valid") {
    throw new MathEngineError("INVALID_MATH_DOCUMENT", `MathDocument validation failed with ${report.issues.length} issue(s).`, {
      path: "$",
      actual: report.issues.slice(0, 8) as never,
      retryable: true
    });
  }
  return value as MathDocument;
}
