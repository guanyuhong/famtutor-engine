export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const ENTITY_TYPES = [
  "scalar",
  "angle",
  "boolean",
  "vector2",
  "point2",
  "line2",
  "segment2",
  "ray2",
  "circle2",
  "arc2",
  "sector2",
  "polygon2",
  "conic2",
  "transform2",
  "interval1",
  "function1",
  "curve2",
  "collection",
  "text"
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type EntityRole = "free" | "derived" | "auxiliary" | "measurement" | "annotation";

export interface MathMetadata {
  title: string;
  locale: string;
  purpose: "exploration" | "demonstration" | "practice" | "assessment" | "authoring";
  description?: string;
  subject?: string;
  grade?: string;
  tags?: string[];
}

export interface MathEntity {
  id: string;
  type: EntityType;
  label?: string;
  role: EntityRole;
  visible?: boolean;
  description?: string;
}

export interface EntityRef {
  ref: string;
}

export interface LiteralInput {
  value: JsonValue;
}

export type CommandInput = EntityRef | LiteralInput;

export interface ConstructionNode {
  id: string;
  command: string;
  inputs?: CommandInput[];
  params?: Record<string, JsonValue>;
  outputs: string[];
  description?: string;
}

export type GraphicsRenderer = "auto" | "jsxgraph-svg" | "jsxgraph-canvas" | "direct-svg";

export interface Graphics2DView {
  id: string;
  kind: "graphics2d";
  visible: boolean;
  renderer: GraphicsRenderer;
  boundingBox: [number, number, number, number];
  axes?: boolean;
  grid?: boolean;
  keepAspectRatio?: boolean;
  /** Canvas background color shared by static and mounted renderers. */
  background?: string;
  cameraPolicy?: "document" | "fit" | "stable_across_stages";
  entityIds?: string[];
  title?: string;
}

export interface ConstructionView {
  id: string;
  kind: "construction";
  visible: boolean;
  renderer: "auto";
  title?: string;
}

export interface AlgebraView {
  id: string;
  kind: "algebra";
  visible: boolean;
  renderer: "auto";
  title?: string;
}

export type MathView = Graphics2DView | ConstructionView | AlgebraView;

export interface EntityStyle {
  token?: "primary" | "accent" | "auxiliary" | "danger" | "muted" | "success";
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  dash?: "solid" | "dashed" | "dotted";
  labelVisible?: boolean;
  /** Preferred point-label anchor. `auto` uses deterministic collision avoidance. */
  labelPlacement?: "auto" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left" | "top-left";
  /** Final pixel correction from the selected point or path-label anchor. */
  labelOffset?: [number, number];
  /** Fractional position of a line/segment/ray label from its first point. */
  lineLabelPosition?: number;
  /** Side of a directed line/segment/ray used for its label. */
  lineLabelSide?: "left" | "right";
  /** Orthogonal path-label distance, as a factor of half the text-box height. */
  lineLabelDistance?: number;
  pointSize?: number;
  fontSize?: number;
}

export interface StyleBinding {
  targets: string[];
  style: EntityStyle;
}

export type InteractionPermission = "select" | "drag" | "edit" | "set_value";

export interface InteractionPolicy {
  target: string;
  permissions: InteractionPermission[];
  dragMode?: "free" | "along_path";
  dragTarget?: string;
  snap?: {
    grid?: number;
    points?: string[];
  };
}

export type MathControlAction =
  | { type: "scalar.set"; target: string; value: number }
  | { type: "stage.set"; stageId: string }
  | { type: "clock.play"; target: string }
  | { type: "clock.pause"; target: string }
  | { type: "clock.reset"; target: string }
  | { type: "clock.step"; target: string };

/** A host-rendered, document-owned control with one auditable action. */
export interface MathControl {
  id: string;
  kind: "button";
  label: string;
  action: MathControlAction;
  description?: string;
}

/**
 * A deterministic logical clock. Each tick advances exactly `step`; elapsed
 * wall time never changes the mathematical state transition.
 */
export interface MathClock {
  id: string;
  target: string;
  start: number;
  end: number;
  step: number;
  intervalMs: number;
  loop?: "none" | "repeat" | "alternate";
  resetValue?: number;
  autoStart?: boolean;
}

export interface ExpressionArgument {
  expr: string;
  variables?: string[];
}

export interface RefArgument {
  ref: string;
}

export interface ValueArgument {
  value: JsonValue;
}

export type AssertionArgument = ExpressionArgument | RefArgument | ValueArgument;

export type AssertionPredicate =
  | "expression_equal"
  | "point_on"
  | "collinear"
  | "parallel"
  | "perpendicular"
  | "coincident"
  | "equal_length"
  | "equal_angle"
  | "value_in_range";

export interface MathAssertion {
  id: string;
  predicate: AssertionPredicate;
  arguments: AssertionArgument[];
  expected?: boolean;
  tolerance?: number;
  requiredMethod?: "construction" | "symbolic" | "numeric" | "any";
  severity?: "error" | "warning";
  message?: string;
}

export interface ActivityStage {
  id: string;
  narration?: string;
  reveal?: string[];
  hide?: string[];
  focus?: string[];
}

export interface ActivityEvidence {
  kind: "event" | "assertion" | "value";
  ref: string;
}

export interface ActivityTask {
  id: string;
  prompt: string;
  allowedTools?: string[];
  evidence?: ActivityEvidence[];
  hints?: string[];
}

export interface MathActivity {
  id: string;
  title: string;
  stages?: ActivityStage[];
  tasks?: ActivityTask[];
}

export interface Provenance {
  generator?: "human" | "agent" | "mixed";
  model?: string;
  sourceRefs?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MathDocument {
  schema: "famtutor.math.document.v1";
  documentId: string;
  revision: number;
  seed: number;
  metadata: MathMetadata;
  entities: MathEntity[];
  construction: ConstructionNode[];
  views: MathView[];
  styles?: StyleBinding[];
  interactions?: InteractionPolicy[];
  controls?: MathControl[];
  clocks?: MathClock[];
  assertions?: MathAssertion[];
  activities?: MathActivity[];
  provenance?: Provenance;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface SuggestedFix {
  description: string;
  operation?: Record<string, JsonValue>;
}

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  path: string;
  message: string;
  expected?: JsonValue;
  actual?: JsonValue;
  suggestedFixes?: SuggestedFix[];
  retryable?: boolean;
}

export interface Point2Value {
  kind: "point2";
  x: number;
  y: number;
}

export interface Vector2Value {
  kind: "vector2";
  x: number;
  y: number;
}

export interface Line2Value {
  kind: "line2";
  a: number;
  b: number;
  c: number;
  point: Point2Value;
  direction: Vector2Value;
}

export interface Segment2Value {
  kind: "segment2";
  from: Point2Value;
  to: Point2Value;
}

export interface Ray2Value {
  kind: "ray2";
  from: Point2Value;
  through: Point2Value;
  direction: Vector2Value;
}

export interface Circle2Value {
  kind: "circle2";
  center: Point2Value;
  radius: number;
}

export interface Arc2Value {
  kind: "arc2";
  center: Point2Value;
  radius: number;
  start: Point2Value;
  end: Point2Value;
  startAngle: number;
  endAngle: number;
}

export interface Sector2Value {
  kind: "sector2";
  arc: Arc2Value;
}

export interface Polygon2Value {
  kind: "polygon2";
  vertices: Point2Value[];
}

export type ConicKind = "ellipse" | "parabola" | "hyperbola";

export interface Conic2Value {
  kind: "conic2";
  conicKind: ConicKind;
  focus1: Point2Value;
  focus2?: Point2Value;
  directrix?: Line2Value;
  /** Ellipse/hyperbola: 2a. Parabola: unused (definition via focus+directrix). */
  parameter: number;
}

export type TransformKind = "translate" | "rotate" | "reflect" | "dilate";

export interface Transform2Value {
  kind: "transform2";
  transformKind: TransformKind;
  vector?: Vector2Value;
  center?: Point2Value;
  angle?: number;
  line?: Line2Value;
  factor?: number;
}

export interface AngleValue {
  kind: "angle";
  vertex: Point2Value;
  from: Point2Value;
  to: Point2Value;
  radians: number;
}

export interface Function1Value {
  kind: "function1";
  expression: string;
  domain: [number, number];
}

/** A connected subset of the real line. `null` denotes an infinite bound. */
export interface Interval1Value {
  kind: "interval1";
  lower: number | null;
  upper: number | null;
  lowerClosed: boolean;
  upperClosed: boolean;
  /** Visual track coordinate; it does not change the represented set. */
  y: number;
  empty: boolean;
}

export interface Curve2Value {
  kind: "curve2";
  xExpression: string;
  yExpression: string;
  parameter: string;
  domain: [number, number];
}

/** A bounded, homogeneous set of renderer-neutral runtime values. */
export interface CollectionValue {
  kind: "collection";
  itemType: Exclude<EntityType, "collection">;
  items: RuntimeValue[];
}

export interface TextValue {
  kind: "text";
  text: string;
  at: Point2Value;
}

export type RuntimeValue =
  | number
  | boolean
  | Point2Value
  | Vector2Value
  | Line2Value
  | Segment2Value
  | Ray2Value
  | Circle2Value
  | Arc2Value
  | Sector2Value
  | Polygon2Value
  | Conic2Value
  | Transform2Value
  | AngleValue
  | Interval1Value
  | Function1Value
  | Curve2Value
  | CollectionValue
  | TextValue;

export interface RuntimeEntity {
  id: string;
  entity: MathEntity;
  nodeId: string;
  command: string;
  dependencies: string[];
  defined: boolean;
  value?: RuntimeValue;
  issue?: ValidationIssue;
}

export interface EvaluationResult {
  documentId: string;
  revision: number;
  order: string[];
  entities: Map<string, RuntimeEntity>;
  issues: ValidationIssue[];
}

export type AssertionStatus = "passed" | "failed" | "undefined" | "unverified";
export type EvidenceMethod = "construction" | "numeric" | "symbolic";

export interface AssertionEvidence {
  assertionId: string;
  status: AssertionStatus;
  method: EvidenceMethod;
  residual?: number;
  tolerance: number;
  message?: string;
  dependencies?: string[];
  samples?: number;
}

export interface ValidationReport {
  status: "valid" | "invalid" | "partial";
  issues: ValidationIssue[];
  assertionEvidence: AssertionEvidence[];
  undefinedEntities: string[];
  graph?: {
    nodeOrder: string[];
    edges: Array<[string, string]>;
  };
}

export interface RenderReport {
  backend: "direct-svg" | "jsxgraph-svg" | "jsxgraph-canvas";
  viewId: string;
  width: number;
  height: number;
  renderedEntities: string[];
  skippedEntities: Array<{ id: string; reason: string }>;
  warnings: ValidationIssue[];
  renderHash: string;
}

export interface DirectSvgResult {
  svg: string;
  report: RenderReport;
}

export interface NormalizedMathEvent {
  type: string;
  target?: string;
  timestamp: number;
  documentId: string;
  revision: number;
  value?: JsonValue;
  position?: [number, number];
  stageId?: string;
}

export interface SimulationObservation {
  key: string;
  value: JsonValue;
}

export interface SimulationFrame {
  index: number;
  progress: number;
  position?: [number, number];
  observations: SimulationObservation[];
  assertions: AssertionEvidence[];
  issues: ValidationIssue[];
}

export interface SimulationResult {
  documentId: string;
  revision: number;
  action: Record<string, JsonValue>;
  eventTrace: NormalizedMathEvent[];
  frames: SimulationFrame[];
  finalState: Record<string, JsonValue>;
  issues: ValidationIssue[];
  committedRevision?: number;
}

export interface AgentToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
  outputSchema?: Record<string, JsonValue>;
}
