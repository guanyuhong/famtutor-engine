/**
 * L1 macro catalog — expands to L0 commands. These are intentionally NOT L0 primitives.
 * Agent tooling may later expose them as sugar that lowers into MathDocument construction nodes.
 */

export interface MacroExpansionStep {
  command: string;
  inputs?: Array<{ ref: string } | { value: unknown }>;
  params?: Record<string, unknown>;
  outputs: string[];
  description?: string;
}

export interface MacroDefinition {
  name: string;
  title: string;
  description: string;
  /** Formal inputs referred to by the expansion template. */
  inputs: string[];
  /** Output entities produced by the macro. */
  outputs: string[];
  /** Human-readable expansion sketch using placeholder entity ids. */
  expandsTo: string[];
  reasonKeptAsMacro: string;
}

export const MACRO_DEFINITIONS: readonly MacroDefinition[] = Object.freeze([
  {
    name: "macro.line.perpendicular_bisector",
    title: "Perpendicular bisector",
    description: "Line through the midpoint of AB, perpendicular to AB.",
    inputs: ["A", "B"],
    outputs: ["M", "AB", "bisector"],
    expandsTo: [
      "point.midpoint(A,B) -> M",
      "segment.through_points(A,B) -> AB",
      "line.perpendicular_through(M, AB) -> bisector"
    ],
    reasonKeptAsMacro: "Composable from existing L0 midpoint + perpendicular; keep provenance as a named recipe."
  },
  {
    name: "macro.ray.angle_bisector",
    title: "Angle bisector",
    description: "Ray that bisects angle ABC.",
    inputs: ["A", "B", "C"],
    outputs: ["bisector"],
    expandsTo: [
      "circle.through_points(B,A) -> c1",
      "point.intersection_line_circle(ray BC / line BC, c1) -> P (choose arm point)",
      "circle.through_points(B, unit on BA) / equal-radius intersections -> Q",
      "ray.from_points(B, angle-equal construction point) -> bisector"
    ],
    reasonKeptAsMacro: "Multiple equivalent L0 constructions; do not freeze one as a primitive."
  },
  {
    name: "macro.point.triangle_centroid",
    title: "Triangle centroid",
    description: "Intersection of medians of triangle ABC.",
    inputs: ["A", "B", "C"],
    outputs: ["G"],
    expandsTo: [
      "point.midpoint(B,C) -> Ma",
      "point.midpoint(A,C) -> Mb",
      "line.through_points(A,Ma) -> medianA",
      "line.through_points(B,Mb) -> medianB",
      "point.intersection_line_line(medianA, medianB) -> G"
    ],
    reasonKeptAsMacro: "Pure composition of midpoint and line intersection."
  },
  {
    name: "macro.point.triangle_circumcenter",
    title: "Triangle circumcenter",
    description: "Center of the circumcircle of ABC.",
    inputs: ["A", "B", "C"],
    outputs: ["O", "circum"],
    expandsTo: [
      "circle.through_three_points(A,B,C) -> circum",
      "point.midpoint / perpendicular bisectors intersection -> O (or circle center extraction later)"
    ],
    reasonKeptAsMacro: "Already covered by circle.through_three_points plus perpendicular-bisector recipe."
  },
  {
    name: "macro.point.triangle_orthocenter",
    title: "Triangle orthocenter",
    description: "Intersection of altitudes of ABC.",
    inputs: ["A", "B", "C"],
    outputs: ["H"],
    expandsTo: [
      "line.through_points(B,C) -> a",
      "line.perpendicular_through(A,a) -> ha",
      "line.through_points(A,C) -> b",
      "line.perpendicular_through(B,b) -> hb",
      "point.intersection_line_line(ha, hb) -> H"
    ],
    reasonKeptAsMacro: "Altitude construction is L0-closed."
  },
  {
    name: "macro.point.triangle_incenter",
    title: "Triangle incenter",
    description: "Intersection of angle bisectors of ABC.",
    inputs: ["A", "B", "C"],
    outputs: ["I"],
    expandsTo: [
      "macro.ray.angle_bisector(B,A,C) -> bisA",
      "macro.ray.angle_bisector(A,B,C) -> bisB",
      "point.intersection_line_line(bisA, bisB) -> I"
    ],
    reasonKeptAsMacro: "Depends on angle-bisector macro; not an L0 atom."
  },
  {
    name: "macro.line.tangent_at_circle_point",
    title: "Tangent at circle point",
    description: "Tangent line to a circle at a point on the circle.",
    inputs: ["circle", "P"],
    outputs: ["tangent"],
    expandsTo: [
      "line.through_points(center, P) -> radiusLine",
      "line.perpendicular_through(P, radiusLine) -> tangent"
    ],
    reasonKeptAsMacro: "Radius-perpendicular theorem is L0-closed."
  },
  {
    name: "macro.line.tangents_from_external_point",
    title: "Tangents from external point",
    description: "Two tangent lines from an external point to a circle.",
    inputs: ["circle", "P"],
    outputs: ["T1", "T2", "tangent1", "tangent2"],
    expandsTo: [
      "circle.through_points(midpoint(center,P), ...) / Thales construction -> contact points T1,T2",
      "line.through_points(P,T1) -> tangent1",
      "line.through_points(P,T2) -> tangent2"
    ],
    reasonKeptAsMacro: "Contact points are constructed; keep as recipe above L0."
  }
]);

export const MACRO_NAMES = Object.freeze(MACRO_DEFINITIONS.map(definition => definition.name));

export function getMacroDefinition(name: string): MacroDefinition | undefined {
  return MACRO_DEFINITIONS.find(definition => definition.name === name);
}

export function macroCapabilities(): Array<Record<string, unknown>> {
  return MACRO_DEFINITIONS.map(definition => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputs: [...definition.inputs],
    outputs: [...definition.outputs],
    expandsTo: [...definition.expandsTo],
    layer: "L1",
    registeredAsL0: false,
    executable: true
  }));
}
