export function coverageDocument() {
  const entities = [];
  const construction = [];
  const add = (id, type, role, command, inputs = [], params = undefined, outputs = [id]) => {
    for (let index = 0; index < outputs.length; index++) {
      entities.push({ id: outputs[index], type: Array.isArray(type) ? type[index] : type, role, label: (Array.isArray(type) ? type[index] : type) === "point2" ? outputs[index] : undefined });
    }
    construction.push({ id: `op-${id}`, command, inputs, params, outputs });
  };
  add("k", "scalar", "derived", "scalar.constant", [], { value: 2 });
  add("s", "scalar", "free", "scalar.slider", [], { min: 0.5, max: 4, value: 2.5, position: [-5, -5] });
  add("condition", "boolean", "derived", "boolean.expression", [], { expression: "s > k" });
  add("A", "point2", "free", "point.free", [], { coords: [-2, 0] });
  add("B", "point2", "free", "point.free", [], { coords: [2, 0] });
  add("C", "point2", "free", "point.free", [], { coords: [0.8, 3] });
  add("D", "point2", "free", "point.free", [], { coords: [-1, 2] });
  add("expressionPoint", "point2", "derived", "point.from_expressions", [], { x: "s", y: "k" });
  add("AB", "segment2", "derived", "segment.through_points", [{ ref: "A" }, { ref: "B" }]);
  add("lineAB", "line2", "derived", "line.through_points", [{ ref: "A" }, { ref: "B" }]);
  add("rayAB", "ray2", "derived", "ray.from_points", [{ ref: "A" }, { ref: "B" }]);
  add("M", "point2", "derived", "point.midpoint", [{ ref: "A" }, { ref: "B" }]);
  add("parallel", "line2", "derived", "line.parallel_through", [{ ref: "C" }, { ref: "lineAB" }]);
  add("perpendicular", "line2", "derived", "line.perpendicular_through", [{ ref: "C" }, { ref: "lineAB" }]);
  add("projection", "point2", "derived", "point.projection", [{ ref: "D" }, { ref: "lineAB" }]);
  add("lineIntersection", "point2", "derived", "point.intersection_line_line", [{ ref: "lineAB" }, { ref: "perpendicular" }]);
  add("v", "vector2", "derived", "vector.between_points", [{ ref: "A" }, { ref: "C" }]);
  add("vComp", "vector2", "derived", "vector.components", [], { components: [1, -0.5] });
  add("vPolar", "vector2", "derived", "vector.polar", [], { magnitude: "2", angle: "pi/6" });
  add("circleR", "circle2", "derived", "circle.center_radius", [{ ref: "A" }, { ref: "s" }]);
  add("circleP", "circle2", "derived", "circle.through_points", [{ ref: "A" }, { ref: "B" }]);
  add("circum", "circle2", "derived", "circle.through_three_points", [{ ref: "A" }, { ref: "B" }, { ref: "C" }]);
  add("lineCircle", ["point2", "point2"], "derived", "point.intersection_line_circle", [{ ref: "lineAB" }, { ref: "circleP" }], undefined, ["LC1", "LC2"]);
  add("circleCircle", ["point2", "point2"], "derived", "point.intersection_circle_circle", [{ ref: "circleP" }, { ref: "circum" }], undefined, ["CC1", "CC2"]);
  add("glider", "point2", "free", "point.on_path", [{ ref: "circleP" }], { initial: [0, 2] });
  add("poly", "polygon2", "derived", "polygon.vertices", [{ ref: "A" }, { ref: "B" }, { ref: "C" }, { ref: "D" }]);
  add("polyGlider", "point2", "free", "point.on_path", [{ ref: "poly" }], { initial: [0, 1] });
  add("circleProjection", "point2", "derived", "point.projection", [{ ref: "D" }, { ref: "circleP" }]);
  add("ang", "angle", "derived", "angle.three_points", [{ ref: "A" }, { ref: "M" }, { ref: "C" }]);
  add("arc", "arc2", "derived", "arc.center_points", [{ ref: "M" }, { ref: "A" }, { ref: "B" }]);
  add("arc3", "arc2", "derived", "arc.three_points", [{ ref: "B" }, { ref: "C" }, { ref: "D" }]);
  add("sector", "sector2", "derived", "sector.from_arc", [{ ref: "arc" }]);
  add("arcGlider", "point2", "free", "point.on_path", [{ ref: "arc" }], { initial: [0, 1] });
  add("ellipse", "conic2", "derived", "conic.ellipse_foci", [{ ref: "A" }, { ref: "B" }], { majorAxis: "6" });
  add("parabola", "conic2", "derived", "conic.parabola_focus_directrix", [{ ref: "C" }, { ref: "lineAB" }]);
  add("hyperbola", "conic2", "derived", "conic.hyperbola_foci", [{ ref: "A" }, { ref: "B" }], { difference: "2" });
  add("lineConic", ["point2", "point2"], "derived", "point.intersection_line_conic", [{ ref: "lineAB" }, { ref: "ellipse" }], undefined, ["Ell1", "Ell2"]);
  add("translated", "point2", "derived", "transform.translate_point", [{ ref: "D" }, { ref: "v" }]);
  add("rotated", "point2", "derived", "transform.rotate_point", [{ ref: "D" }, { ref: "M" }], { angle: "pi/4" });
  add("reflected", "point2", "derived", "transform.reflect_point_line", [{ ref: "D" }, { ref: "lineAB" }]);
  add("dilated", "point2", "derived", "transform.dilate_point", [{ ref: "D" }, { ref: "M" }], { factor: "k" });
  add("xfTranslate", "transform2", "derived", "transform.translate", [{ ref: "vComp" }]);
  add("xfRotate", "transform2", "derived", "transform.rotate", [{ ref: "M" }], { angle: "pi/6" });
  add("xfReflect", "transform2", "derived", "transform.reflect", [{ ref: "lineAB" }]);
  add("xfDilate", "transform2", "derived", "transform.dilate", [{ ref: "M" }], { factor: "1.5" });
  add("applied", "point2", "derived", "transform.apply", [{ ref: "D" }, { ref: "xfRotate" }]);
  add("f", "function1", "derived", "function.explicit", [], { expression: "s*sin(x)", domain: [-5, 5] });
  add("curve", "curve2", "derived", "curve.parametric", [], { xExpression: "3*cos(t)", yExpression: "2*sin(t)", parameter: "t", domain: [0, 6.283185307179586] });
  add("text", "text", "annotation", "text.at", [{ ref: "C" }], { text: "C" });
  add("conditionalText", "text", "annotation", "text.conditional", [{ ref: "condition" }, { ref: "expressionPoint" }], { trueText: "s > k", falseText: "s ≤ k" });
  add("dist", "scalar", "measurement", "measurement.distance", [{ ref: "A" }, { ref: "C" }]);
  add("length", "scalar", "measurement", "measurement.segment_length", [{ ref: "AB" }]);
  add("angleMeasure", "scalar", "measurement", "measurement.angle", [{ ref: "A" }, { ref: "M" }, { ref: "C" }]);
  add("slope", "scalar", "measurement", "measurement.slope", [{ ref: "perpendicular" }]);
  add("area", "scalar", "measurement", "measurement.area", [{ ref: "poly" }]);
  add("perimeter", "scalar", "measurement", "measurement.perimeter", [{ ref: "circleP" }]);

  return {
    schema: "famtutor.math.document.v1",
    documentId: "command-coverage",
    revision: 1,
    seed: 123,
    metadata: { title: "Command coverage", locale: "en", purpose: "authoring" },
    entities,
    construction,
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-7, 7, 8, -7], axes: true, grid: false, keepAspectRatio: true }],
    interactions: [
      { target: "A", permissions: ["drag"] },
      { target: "B", permissions: ["drag"] },
      { target: "C", permissions: ["drag"] },
      { target: "D", permissions: ["drag"] },
      { target: "glider", permissions: ["drag"], dragMode: "along_path", dragTarget: "circleP" },
      { target: "s", permissions: ["set_value"] }
    ]
  };
}
