import type { EntityType, JsonValue } from "../types.js";

export type TypeConstraint = EntityType | readonly EntityType[];

export interface CommandDefinition {
  name: string;
  title: string;
  description: string;
  inputTypes: readonly TypeConstraint[];
  variadicInputType?: TypeConstraint;
  minInputs?: number;
  maxInputs?: number;
  outputTypes: readonly TypeConstraint[];
  expressionParams?: readonly string[];
  requiredParams?: readonly string[];
  category:
    | "scalar"
    | "point"
    | "line"
    | "circle"
    | "polygon"
    | "transform"
    | "function"
    | "annotation"
    | "measurement"
    | "conic";
  renderer: "jsxgraph" | "computed" | "both";
}

const LINE_LIKE = ["line2", "segment2", "ray2"] as const;
const PATH_LIKE = ["line2", "segment2", "ray2", "circle2", "arc2", "polygon2"] as const;
const PROJECTABLE = ["line2", "segment2", "ray2", "circle2"] as const;
const MEASURE_AREA = ["polygon2", "circle2", "sector2"] as const;
const MEASURE_PERIMETER = ["polygon2", "circle2", "arc2", "segment2"] as const;
const TRANSFORMABLE = [
  "point2",
  "vector2",
  "line2",
  "segment2",
  "ray2",
  "circle2",
  "arc2",
  "sector2",
  "polygon2"
] as const;

const definitions: CommandDefinition[] = [
  {
    name: "scalar.constant",
    title: "Constant scalar",
    description: "Create a fixed numeric scalar from params.value.",
    inputTypes: [],
    outputTypes: ["scalar"],
    requiredParams: ["value"],
    category: "scalar",
    renderer: "computed"
  },
  {
    name: "scalar.slider",
    title: "Scalar slider",
    description: "Create an interactive scalar slider with min, max, value and optional step/position.",
    inputTypes: [],
    outputTypes: ["scalar"],
    requiredParams: ["min", "max", "value"],
    category: "scalar",
    renderer: "jsxgraph"
  },
  {
    name: "point.free",
    title: "Free point",
    description: "Create a free 2D point from params.coords = [x,y].",
    inputTypes: [],
    outputTypes: ["point2"],
    requiredParams: ["coords"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.on_path",
    title: "Point on path",
    description: "Create a point constrained to a line, segment, ray, circle, arc, or polygon boundary.",
    inputTypes: [PATH_LIKE],
    outputTypes: ["point2"],
    requiredParams: ["initial"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.midpoint",
    title: "Midpoint",
    description: "Create the midpoint of two points.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["point2"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.projection",
    title: "Orthogonal projection",
    description: "Project a point orthogonally onto a line-like object or circle.",
    inputTypes: ["point2", PROJECTABLE],
    outputTypes: ["point2"],
    category: "point",
    renderer: "computed"
  },
  {
    name: "point.intersection_line_line",
    title: "Line intersection",
    description: "Create the intersection point of two line-like objects.",
    inputTypes: [LINE_LIKE, LINE_LIKE],
    outputTypes: ["point2"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.intersection_line_circle",
    title: "Line-circle intersections",
    description: "Create the two intersection points of a line-like object and a circle, ordered by increasing line parameter. Tangent returns a duplicated point.",
    inputTypes: [LINE_LIKE, "circle2"],
    outputTypes: ["point2", "point2"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.intersection_circle_circle",
    title: "Circle intersections",
    description: "Create the two intersection points of two circles, ordered by increasing polar angle about the first center. Tangent returns a duplicated point.",
    inputTypes: ["circle2", "circle2"],
    outputTypes: ["point2", "point2"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.intersection_line_conic",
    title: "Line-conic intersections",
    description: "Create up to two intersection points of a line-like object and a conic, ordered by increasing line parameter. Tangent returns a duplicated point.",
    inputTypes: [LINE_LIKE, "conic2"],
    outputTypes: ["point2", "point2"],
    category: "point",
    renderer: "computed"
  },
  {
    name: "segment.through_points",
    title: "Segment through points",
    description: "Create a segment from two points.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["segment2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "line.through_points",
    title: "Line through points",
    description: "Create an infinite line through two points.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["line2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "ray.from_points",
    title: "Ray from points",
    description: "Create a ray starting at the first point and passing through the second.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["ray2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "line.parallel_through",
    title: "Parallel through point",
    description: "Create a line through a point parallel to a line-like object.",
    inputTypes: ["point2", LINE_LIKE],
    outputTypes: ["line2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "line.perpendicular_through",
    title: "Perpendicular through point",
    description: "Create a line through a point perpendicular to a line-like object.",
    inputTypes: ["point2", LINE_LIKE],
    outputTypes: ["line2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "vector.between_points",
    title: "Vector between points",
    description: "Create the directed vector from the first point to the second.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["vector2"],
    category: "line",
    renderer: "both"
  },
  {
    name: "vector.components",
    title: "Vector from components",
    description: "Create a vector from params.components = [x,y].",
    inputTypes: [],
    outputTypes: ["vector2"],
    requiredParams: ["components"],
    category: "line",
    renderer: "computed"
  },
  {
    name: "vector.polar",
    title: "Vector from polar form",
    description: "Create a vector from params.magnitude and params.angle (radians, expression allowed).",
    inputTypes: [],
    outputTypes: ["vector2"],
    requiredParams: ["magnitude", "angle"],
    expressionParams: ["magnitude", "angle"],
    category: "line",
    renderer: "computed"
  },
  {
    name: "circle.center_radius",
    title: "Circle by center and radius",
    description: "Create a circle from a center point and radius expression or scalar input.",
    inputTypes: ["point2"],
    variadicInputType: "scalar",
    minInputs: 1,
    maxInputs: 2,
    outputTypes: ["circle2"],
    expressionParams: ["radius"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "circle.through_points",
    title: "Circle by center and point",
    description: "Create a circle from its center and one point on the circumference.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["circle2"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "circle.through_three_points",
    title: "Circumcircle",
    description: "Create the unique circle through three non-collinear points.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["circle2"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "arc.center_points",
    title: "Arc by center and endpoints",
    description: "Create a circular arc from a center and two endpoints (CCW from start to end).",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["arc2"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "arc.three_points",
    title: "Arc through three points",
    description: "Create the circular arc through three non-collinear points, with the middle point on the swept arc.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["arc2"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "sector.from_arc",
    title: "Sector from arc",
    description: "Create a circular sector from an arc.",
    inputTypes: ["arc2"],
    outputTypes: ["sector2"],
    category: "circle",
    renderer: "both"
  },
  {
    name: "polygon.vertices",
    title: "Polygon by vertices",
    description: "Create a polygon from three or more point inputs.",
    inputTypes: [],
    variadicInputType: "point2",
    minInputs: 3,
    maxInputs: 64,
    outputTypes: ["polygon2"],
    category: "polygon",
    renderer: "both"
  },
  {
    name: "angle.three_points",
    title: "Angle through three points",
    description: "Create angle ABC, with the second point as vertex.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["angle"],
    category: "polygon",
    renderer: "both"
  },
  {
    name: "conic.ellipse_foci",
    title: "Ellipse from foci",
    description: "Create an ellipse from two foci and params.majorAxis = 2a (expression allowed).",
    inputTypes: ["point2", "point2"],
    outputTypes: ["conic2"],
    requiredParams: ["majorAxis"],
    expressionParams: ["majorAxis"],
    category: "conic",
    renderer: "both"
  },
  {
    name: "conic.parabola_focus_directrix",
    title: "Parabola from focus and directrix",
    description: "Create a parabola from a focus point and a directrix line-like object.",
    inputTypes: ["point2", LINE_LIKE],
    outputTypes: ["conic2"],
    category: "conic",
    renderer: "both"
  },
  {
    name: "conic.hyperbola_foci",
    title: "Hyperbola from foci",
    description: "Create a hyperbola from two foci and params.difference = 2a (expression allowed).",
    inputTypes: ["point2", "point2"],
    outputTypes: ["conic2"],
    requiredParams: ["difference"],
    expressionParams: ["difference"],
    category: "conic",
    renderer: "both"
  },
  {
    name: "transform.translate_point",
    title: "Translate point",
    description: "Translate a point by a vector.",
    inputTypes: ["point2", "vector2"],
    outputTypes: ["point2"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.rotate_point",
    title: "Rotate point",
    description: "Rotate a point about a center by params.angle radians or a safe expression.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["point2"],
    requiredParams: ["angle"],
    expressionParams: ["angle"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.reflect_point_line",
    title: "Reflect point across line",
    description: "Reflect a point across a line-like object.",
    inputTypes: ["point2", LINE_LIKE],
    outputTypes: ["point2"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.dilate_point",
    title: "Dilate point",
    description: "Dilate a point from a center by params.factor.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["point2"],
    requiredParams: ["factor"],
    expressionParams: ["factor"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.translate",
    title: "Translation transform",
    description: "Create a translation transform object from a vector.",
    inputTypes: ["vector2"],
    outputTypes: ["transform2"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.rotate",
    title: "Rotation transform",
    description: "Create a rotation transform about a center by params.angle radians.",
    inputTypes: ["point2"],
    outputTypes: ["transform2"],
    requiredParams: ["angle"],
    expressionParams: ["angle"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.reflect",
    title: "Reflection transform",
    description: "Create a reflection transform across a line-like object.",
    inputTypes: [LINE_LIKE],
    outputTypes: ["transform2"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.dilate",
    title: "Dilation transform",
    description: "Create a dilation transform about a center by params.factor.",
    inputTypes: ["point2"],
    outputTypes: ["transform2"],
    requiredParams: ["factor"],
    expressionParams: ["factor"],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "transform.apply",
    title: "Apply transform",
    description: "Apply a transform2 object to a point, vector, line-like, circle, arc, sector, or polygon. Output entity type must match the transformed value kind.",
    inputTypes: [TRANSFORMABLE, "transform2"],
    outputTypes: [TRANSFORMABLE],
    category: "transform",
    renderer: "computed"
  },
  {
    name: "function.explicit",
    title: "Explicit function",
    description: "Create y=f(x) from a safe expression and domain.",
    inputTypes: [],
    outputTypes: ["function1"],
    requiredParams: ["expression", "domain"],
    expressionParams: ["expression"],
    category: "function",
    renderer: "both"
  },
  {
    name: "curve.parametric",
    title: "Parametric curve",
    description: "Create [x(t), y(t)] from safe expressions and a parameter domain.",
    inputTypes: [],
    outputTypes: ["curve2"],
    requiredParams: ["xExpression", "yExpression", "domain"],
    expressionParams: ["xExpression", "yExpression"],
    category: "function",
    renderer: "both"
  },
  {
    name: "text.at",
    title: "Text annotation",
    description: "Create a text annotation at a literal position or a point input.",
    inputTypes: [],
    variadicInputType: "point2",
    minInputs: 0,
    maxInputs: 1,
    outputTypes: ["text"],
    requiredParams: ["text"],
    category: "annotation",
    renderer: "both"
  },
  {
    name: "measurement.distance",
    title: "Distance",
    description: "Measure distance between two points.",
    inputTypes: ["point2", "point2"],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  },
  {
    name: "measurement.segment_length",
    title: "Segment length",
    description: "Measure the length of a segment or vector.",
    inputTypes: [["segment2", "vector2"]],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  },
  {
    name: "measurement.angle",
    title: "Angle measure",
    description: "Measure angle ABC in radians.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  },
  {
    name: "measurement.slope",
    title: "Slope",
    description: "Measure the slope of a line-like object.",
    inputTypes: [LINE_LIKE],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  },
  {
    name: "measurement.area",
    title: "Area",
    description: "Measure the area of a polygon, circle, or sector.",
    inputTypes: [MEASURE_AREA],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  },
  {
    name: "measurement.perimeter",
    title: "Perimeter or arc length",
    description: "Measure polygon perimeter, circle circumference, arc length, or segment length.",
    inputTypes: [MEASURE_PERIMETER],
    outputTypes: ["scalar"],
    category: "measurement",
    renderer: "computed"
  }
];

export const COMMAND_CATALOG: ReadonlyMap<string, CommandDefinition> = new Map(
  definitions.map(definition => [definition.name, Object.freeze(definition)])
);

export const COMMAND_NAMES = Object.freeze(definitions.map(definition => definition.name));

export function getCommandDefinition(name: string): CommandDefinition | undefined {
  return COMMAND_CATALOG.get(name);
}

export function typeConstraintMatches(constraint: TypeConstraint, actual: EntityType): boolean {
  return Array.isArray(constraint) ? constraint.includes(actual) : constraint === actual;
}

export function expectedInputType(definition: CommandDefinition, index: number): TypeConstraint | undefined {
  if (index < definition.inputTypes.length) return definition.inputTypes[index];
  return definition.variadicInputType;
}

export function commandCapabilities(): Array<Record<string, JsonValue>> {
  return definitions.map(definition => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    inputTypes: definition.inputTypes.map(constraint =>
      Array.isArray(constraint) ? [...constraint] : constraint
    ) as JsonValue,
    variadicInputType: definition.variadicInputType
      ? (Array.isArray(definition.variadicInputType)
          ? [...definition.variadicInputType]
          : String(definition.variadicInputType))
      : null,
    minInputs: definition.minInputs ?? definition.inputTypes.length,
    maxInputs: definition.maxInputs ?? definition.inputTypes.length,
    outputTypes: definition.outputTypes.map(constraint =>
      Array.isArray(constraint) ? [...constraint] : constraint
    ) as JsonValue,
    requiredParams: [...(definition.requiredParams ?? [])],
    expressionParams: [...(definition.expressionParams ?? [])],
    renderer: definition.renderer
  }));
}
