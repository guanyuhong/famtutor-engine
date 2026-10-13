import { ENTITY_TYPES, type EntityType, type JsonValue } from "../types.js";

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
    | "interval"
    | "function"
    | "annotation"
    | "measurement"
    | "conic"
    | "collection"
    | "geometry3d";
  renderer: "jsxgraph" | "computed" | "both";
}

const LINE_LIKE = ["line2", "segment2", "ray2"] as const;
const PATH_LIKE = ["line2", "segment2", "ray2", "circle2", "arc2", "polygon2"] as const;
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

const COLLECTION_DEPENDENCY = ENTITY_TYPES.filter(type => type !== "collection") as Exclude<EntityType, "collection">[];

const POINT3_INPUTS = ["point3"] as const;

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
    description: "Create an interactive scalar slider with min, max, value and optional step/position/length. params.animation may declaratively auto-start the native JSXGraph slider animation when the slider becomes visible: { autoStart, direction: 1|-1, stepCount, delayMs, maxRounds, startDelayMs }. User pointer input and scalar.set stop auto-play so manual control always wins.",
    inputTypes: [],
    outputTypes: ["scalar"],
    requiredParams: ["min", "max", "value"],
    category: "scalar",
    renderer: "jsxgraph"
  },
  {
    name: "boolean.constant",
    title: "Mutable boolean",
    description: "Create a free boolean from params.value. Hosts may change it only through audited boolean.set or boolean.toggle actions.",
    inputTypes: [],
    outputTypes: ["boolean"],
    requiredParams: ["value"],
    category: "scalar",
    renderer: "computed"
  },
  {
    name: "boolean.expression",
    title: "Boolean expression",
    description: "Evaluate a safe boolean expression against scalar or other runtime entities.",
    inputTypes: [],
    outputTypes: ["boolean"],
    requiredParams: ["expression"],
    expressionParams: ["expression"],
    category: "scalar",
    renderer: "computed"
  },
  {
    name: "interval.from_bounds",
    title: "Real interval from bounds",
    description: "Create a real interval from optional finite lower/upper bounds, endpoint inclusion flags, and an optional visual track y-coordinate. An omitted bound is infinite.",
    inputTypes: [],
    outputTypes: ["interval1"],
    expressionParams: ["lower", "upper", "y"],
    category: "interval",
    renderer: "both"
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
    name: "collection.sequence",
    title: "Bounded construction sequence",
    description: "Generate a bounded homogeneous point2, segment2, circle2, or polygon2 collection by evaluating one existing single-output L0 command for an inclusive numeric index range. params requires itemType, variable, from, to, template and maxItems (1..256). Template inputs use {local:true} or {input:index}; nested collection commands are rejected.",
    inputTypes: [],
    variadicInputType: COLLECTION_DEPENDENCY,
    minInputs: 0,
    maxInputs: 32,
    outputTypes: ["collection"],
    requiredParams: ["itemType", "variable", "from", "to", "template", "maxItems"],
    category: "collection",
    renderer: "both"
  },
  {
    name: "collection.map",
    title: "Map a construction over a collection",
    description: "Map one existing single-output L0 command over a bounded homogeneous point2, segment2, circle2, or polygon2 source collection. The source is input 1; additional explicit inputs are available to the template through {input:index}. params requires itemType, variable, template and maxItems (1..256).",
    inputTypes: ["collection"],
    variadicInputType: COLLECTION_DEPENDENCY,
    minInputs: 1,
    maxInputs: 32,
    outputTypes: ["collection"],
    requiredParams: ["itemType", "variable", "template", "maxItems"],
    category: "collection",
    renderer: "both"
  },
  {
    name: "point3.free",
    title: "Free 3D point",
    description: "Create a free 3D point from params.coords = [x,y,z]. The point is renderer-neutral and may be mounted by a graphics3d backend.",
    inputTypes: [], outputTypes: ["point3"], requiredParams: ["coords"], category: "geometry3d", renderer: "both"
  },
  {
    name: "point3.from_expressions",
    title: "3D point from expressions",
    description: "Create a derived 3D point from safe x, y and z expressions.",
    inputTypes: [], outputTypes: ["point3"], requiredParams: ["x", "y", "z"], expressionParams: ["x", "y", "z"], category: "geometry3d", renderer: "both"
  },
  {
    name: "vector3.between_points",
    title: "3D vector between points",
    description: "Create the vector from the first 3D point to the second.",
    inputTypes: ["point3", "point3"], outputTypes: ["vector3"], category: "geometry3d", renderer: "computed"
  },
  {
    name: "line3.through_points",
    title: "3D line through points",
    description: "Create an infinite 3D line through two distinct points.",
    inputTypes: ["point3", "point3"], outputTypes: ["line3"], category: "geometry3d", renderer: "both"
  },
  {
    name: "segment3.through_points",
    title: "3D segment through points",
    description: "Create a finite 3D segment between two distinct points.",
    inputTypes: ["point3", "point3"], outputTypes: ["segment3"], category: "geometry3d", renderer: "both"
  },
  {
    name: "plane3.through_points",
    title: "Plane through three points",
    description: "Create a plane from three non-collinear 3D points. Optional params.uRange and params.vRange bound its visual patch.",
    inputTypes: ["point3", "point3", "point3"], outputTypes: ["plane3"], category: "geometry3d", renderer: "both"
  },
  {
    name: "polygon3.vertices",
    title: "3D polygon from vertices",
    description: "Create a planar teaching polygon from at least three ordered 3D points.",
    inputTypes: POINT3_INPUTS, variadicInputType: "point3", minInputs: 3, maxInputs: 64, outputTypes: ["polygon3"], category: "geometry3d", renderer: "both"
  },
  {
    name: "sphere3.center_radius",
    title: "Sphere from center and radius",
    description: "Create a sphere from a 3D center and either scalar input or numeric/expression params.radius.",
    inputTypes: ["point3"], variadicInputType: "scalar", minInputs: 1, maxInputs: 2, outputTypes: ["sphere3"], expressionParams: ["radius"], category: "geometry3d", renderer: "both"
  },
  {
    name: "curve3.parametric",
    title: "Parametric space curve",
    description: "Create a 3D parametric curve from x/y/z expressions, a parameter name and params.domain=[min,max].",
    inputTypes: [], outputTypes: ["curve3"], requiredParams: ["xExpression", "yExpression", "zExpression", "domain"], expressionParams: ["xExpression", "yExpression", "zExpression"], category: "geometry3d", renderer: "both"
  },
  {
    name: "surface3.parametric",
    title: "Parametric surface",
    description: "Create a 3D parametric surface from x/y/z expressions, two parameter names, and finite uDomain/vDomain intervals.",
    inputTypes: [], outputTypes: ["surface3"], requiredParams: ["xExpression", "yExpression", "zExpression", "uDomain", "vDomain"], expressionParams: ["xExpression", "yExpression", "zExpression"], category: "geometry3d", renderer: "both"
  },
  {
    name: "point.from_expressions",
    title: "Point from expressions",
    description: "Create a derived point from safe params.x and params.y expressions.",
    inputTypes: [],
    outputTypes: ["point2"],
    requiredParams: ["x", "y"],
    expressionParams: ["x", "y"],
    category: "point",
    renderer: "both"
  },
  {
    name: "point.on_path",
    title: "Point on path",
    description: "Create a point constrained to a path. Legacy initial coordinates are reprojected; optional pathParameter retains an intrinsic coordinate for line/segment/ray/circle motion. Optional positive pathScale (safe expression) scales the oriented line frame. Direct dragging recomputes the intrinsic coordinate. Internal parameters are not normalized GeoGebra PathParameter values.",
    inputTypes: [PATH_LIKE],
    outputTypes: ["point2"],
    requiredParams: ["initial"],
    expressionParams: ["pathScale"],
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
    name: "point.circle_center",
    title: "Circle center",
    description: "Extract the center point from a circle. This is a pure computed projection of circle2 state.",
    inputTypes: ["circle2"],
    outputTypes: ["point2"],
    category: "point",
    renderer: "computed"
  },
  {
    name: "point.projection",
    title: "Closest point on path",
    description: "Return the nearest point on a line, segment, ray, circle, arc, or polygon boundary. For unbounded linear paths this is the orthogonal projection.",
    inputTypes: ["point2", PATH_LIKE],
    outputTypes: ["point2"],
    category: "point",
    renderer: "computed"
  },
  {
    name: "point.invert_in_circle",
    title: "Point inversion in circle",
    description: "Invert a point in a circle using OP × OP' = R². The inversion center itself is undefined.",
    inputTypes: ["point2", "circle2"],
    outputTypes: ["point2"],
    category: "transform",
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
    name: "ray.angle_bisector",
    title: "Internal or external angle bisector",
    description: "Create the internal or external angle-bisector ray of angle left-vertex-right. params.branch must be 'internal' or 'external'. The external direction is normalized(vertex→left) minus normalized(vertex→right), so swapping the arm inputs reverses that ray.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["ray2"],
    requiredParams: ["branch"],
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
    name: "line.common_tangent",
    title: "Oriented common tangent",
    description: "Construct one common tangent of two circles selected by params.side1 and params.side2, each -1 or 1. Impossible branches are undefined.",
    inputTypes: ["circle2", "circle2"],
    outputTypes: ["line2"],
    requiredParams: ["side1", "side2"],
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
    name: "vector.scale",
    title: "Scale vector",
    description: "Multiply an existing vector by params.factor. The factor may be a number or a safe expression, enabling slider-driven translations without reconstructing the vector direction.",
    inputTypes: ["vector2"],
    outputTypes: ["vector2"],
    requiredParams: ["factor"],
    expressionParams: ["factor"],
    category: "line",
    renderer: "computed"
  },
  {
    name: "circle.center_radius",
    title: "Circle by center and radius",
    description: "Create a circle from a center point and radius expression or scalar input. Optional allowPointCircle accepts radius zero as a degenerate point circle; negative radii remain undefined.",
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
    name: "circle.invert_in_circle",
    title: "Circle inversion in circle",
    description: "Invert a circle in another circle. The source must not pass through the inversion center because that image is a line rather than circle2.",
    inputTypes: ["circle2", "circle2"],
    outputTypes: ["circle2"],
    category: "transform",
    renderer: "computed"
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
    name: "polygon.regular",
    title: "Regular polygon",
    description: "Create a regular polygon centered at a point. Inputs are center point, circumradius scalar, and integer vertex-count scalar. params.maxVertices is a required renderer bound from 3 to 64; optional params.rotation is the first-vertex angle in radians (default pi/2). Fails when radius is non-positive, vertexCount is non-integral/outside 3..maxVertices, or maxVertices is invalid.",
    inputTypes: ["point2", "scalar", "scalar"],
    outputTypes: ["polygon2"],
    requiredParams: ["maxVertices"],
    expressionParams: ["rotation"],
    category: "polygon",
    renderer: "both"
  },
  {
    name: "polygon.diagonals",
    title: "Polygon diagonals",
    description: "Create a bounded segment collection containing every diagonal of a polygon, or only diagonals incident to optional zero-based params.fromVertex. params.maxItems is required (1..256); evaluation fails instead of truncating when the result exceeds it.",
    inputTypes: ["polygon2"],
    outputTypes: ["collection"],
    requiredParams: ["maxItems"],
    category: "polygon",
    renderer: "both"
  },
  {
    name: "angle.three_points",
    title: "Angle through three points",
    description: "Create angle ABC, with the second point as vertex. Optional params.radius controls the arc radius in document units (default 0.6); optional params.labelRadius places the label center on the angle bisector and must be greater than radius. Without labelRadius, both renderers choose a text-aware automatic distance.",
    inputTypes: ["point2", "point2", "point2"],
    outputTypes: ["angle"],
    category: "polygon",
    renderer: "both"
  },
  {
    name: "marker.right_angle",
    title: "Right-angle marker",
    description: "Render a square marker for an existing 90-degree angle. Input: one angle entity. params.size: positive marker side length in document units. Fails with NOT_RIGHT_ANGLE when the angle differs from 90 degrees by more than 1e-6 radians.",
    inputTypes: ["angle"],
    outputTypes: ["polygon2"],
    requiredParams: ["size"],
    category: "annotation",
    renderer: "both"
  },
  {
    name: "marker.segment_tick",
    title: "Segment equality tick",
    description: "Create one segment perpendicular to an existing segment as a standard equality tick. params.size is the full tick length in document units; optional params.position is the fraction from the segment's first endpoint (default 0.5, range 0..1). Compose two or more calls at distinct positions for double- or triple-tick conventions.",
    inputTypes: ["segment2"],
    outputTypes: ["segment2"],
    requiredParams: ["size"],
    category: "annotation",
    renderer: "both"
  },
  {
    name: "marker.parallel_chevron",
    title: "Parallel-line chevron",
    description: "Create one standard open chevron centered at a point and aligned with a line, segment, or ray. Inputs are the marker anchor point and the referenced line-like object; params.size is the full marker width in document units. The command returns the two segment arms. Compose repeated calls at distinct anchor points for double-chevron conventions.",
    inputTypes: ["point2", LINE_LIKE],
    outputTypes: ["segment2", "segment2"],
    requiredParams: ["size"],
    category: "annotation",
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
    name: "function.piecewise",
    title: "Piecewise function",
    description: "Create one function1 from 1..16 ordered non-overlapping branches. Each params.branches item has expression, domain=[from,to], and optional lowerClosed/upperClosed endpoint flags; two branches cannot both include a shared endpoint.",
    inputTypes: [],
    outputTypes: ["function1"],
    requiredParams: ["branches"],
    category: "function",
    renderer: "both"
  },
  {
    name: "function.value_at",
    title: "Function value at an input",
    description: "Evaluate an existing function1 at a scalar input. The input must lie inside the function's declared closed domain.",
    inputTypes: ["function1", "scalar"],
    outputTypes: ["scalar"],
    category: "function",
    renderer: "computed"
  },
  {
    name: "point.function_root",
    title: "Bracketed function root",
    description: "Find one x-axis point of an existing function1 inside params.bracket=[from,to] using deterministic bisection. Endpoints must lie in the function domain and either contain a root or have opposite signs.",
    inputTypes: ["function1"],
    outputTypes: ["point2"],
    requiredParams: ["bracket"],
    category: "point",
    renderer: "computed"
  },
  {
    name: "region.function_inequality",
    title: "Function inequality region",
    description: "Create the plane region above or below an existing function1 on params.domain=[from,to]. params.relation is above or below; boundaryIncluded defaults to true and controls the boundary line style.",
    inputTypes: ["function1"],
    outputTypes: ["region2"],
    requiredParams: ["relation", "domain"],
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
    name: "text.conditional",
    title: "Conditional text annotation",
    description: "Show params.trueText or params.falseText from a boolean input, optionally anchored to a point.",
    inputTypes: ["boolean"],
    variadicInputType: "point2",
    minInputs: 1,
    maxInputs: 2,
    outputTypes: ["text"],
    requiredParams: ["trueText", "falseText"],
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
    name: "measurement.circle_radius",
    title: "Circle radius",
    description: "Extract the positive radius from a circle as a scalar measurement.",
    inputTypes: ["circle2"],
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
