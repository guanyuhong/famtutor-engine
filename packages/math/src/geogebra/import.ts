/** GeoGebra construction -> existing FamTutor MathDocument. This module is a compiler, NOT another math kernel. */
import type { EntityType, JsonValue, MathDocument, EntityStyle } from "../types.js";
import type { ExpressionNode } from "../expression/ast.js";
import { parseExpression, collectExpressionIdentifiers } from "../expression/parser.js";
import { evaluateNumericExpression, SAFE_BUILTIN_NAMES } from "../expression/evaluator.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import { pathPointDragPatch } from "../kernel/path-state.js";
import { independentLineCoefficients } from "./independent-line.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import { child, indexed, parseGgbXml, ggbFail, GgbImportError, type GgbXmlNode } from "./xml.js";

export interface GeoGebraImportDiagnostic { code: string; severity: "error" | "warning"; label?: string; message: string }
export interface GeoGebraImportOptions {
  documentId?: string;
  /** Strict by default. A preview NEVER upgrades partial geometry to complete source compatibility. */
  allowPartial?: boolean;
  bounds?: [number, number, number, number];
  title?: string;
}
export interface GeoGebraImportResult {
  schema: "famtutor.geogebra.import.v1";
  status: "ready" | "partial" | "rejected";
  document?: MathDocument;
  labels: Record<string, string>;
  diagnostics: GeoGebraImportDiagnostic[];
  source: { format: string; version: string; declaredObjects: number; importedObjects: number; scriptsExecuted: false };
}
interface Command { name: string; inputs: string[]; outputs: string[] }
interface RecordItem { element?: GgbXmlNode; expression?: string; expressionType?: string; command?: Command }
const linear = new Set<EntityType>(["line2", "segment2", "ray2"]);
const scalar = new Set<EntityType>(["scalar", "angle"]);
const names = new Set(SAFE_BUILTIN_NAMES);

/** Split argument lists without evaluating JavaScript, respecting nested brackets and quoted text. */
export function splitGeoGebraArguments(text: string): string[] {
  const result: string[] = []; let depth = 0; let quote = ""; let start = 0;
  for (let i=0; i<text.length; i++) {
    const c=text[i]!;
    if (quote) { if (c === quote && text[i-1] !== "\\") quote=""; continue; }
    if (c === '"') quote=c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (--depth<0) ggbFail("ARGUMENT_SYNTAX", "Unbalanced argument list."); }
    else if (c === "," && depth === 0) { result.push(text.slice(start,i).trim()); start=i+1; }
  }
  if (depth || quote) ggbFail("ARGUMENT_SYNTAX", "Unclosed argument list.");
  if (text.trim()) result.push(text.slice(start).trim());
  if (result.some(x=>!x)) ggbFail("ARGUMENT_SYNTAX", "Empty argument.");
  return result;
}
function numeric(value: string | undefined): number {
  if (value === undefined || !value.trim() || !Number.isFinite(Number(value))) ggbFail("NONFINITE_CONSTANT", `Not a finite number: ${String(value)}`);
  return Number(value);
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

class Compiler {
  readonly records = new Map<string, RecordItem>();
  readonly labels: Record<string,string> = Object.create(null);
  readonly diagnostics: GeoGebraImportDiagnostic[] = [];
  readonly state = new Map<string,"busy"|"done"|"failed">();
  readonly types = new Map<string,EntityType>();
  readonly document: MathDocument;
  private readonly lineScales = new Map<string,string>();
  private serial = 0;
  private expansions = 0;
  constructor(readonly root: GgbXmlNode, readonly options: GeoGebraImportOptions) {
    this.document = { schema:"famtutor.math.document.v1", documentId:options.documentId??"geogebra-import", revision:1, seed:0,
      metadata:{ title:options.title||child(root,"construction")?.attributes.title||"GeoGebra construction",locale:"zh-CN",purpose:"exploration" },
      entities:[], construction:[], views:[{id:"main",kind:"graphics2d",visible:true,renderer:"jsxgraph-svg",boundingBox:options.bounds??[-10,10,10,-10],axes:false,grid:false,keepAspectRatio:true}],
      interactions:[],styles:[],provenance:{generator:"mixed",sourceRefs:["https://geogebra.github.io/docs/reference/en/XML/"]} };
    const construction=child(root,"construction"); if(!construction) ggbFail("NO_CONSTRUCTION","Missing construction element.");
    if (root.children.some(n=>["javascript","ggbscript","script"].includes(n.name))) this.issue("SCRIPT_BLOCKED","Root scripts are never executed.");
    if (root.children.some(n=>n.name==="macro")) this.issue("MACRO_UNSUPPORTED","Custom tools require separate lowering.");
    for(const item of construction.children) {
      if(item.name==="element"||item.name==="expression") {
        const label=item.attributes.label; if(!label) ggbFail("NO_LABEL","An element/expression has no label.");
        const record=this.records.get(label)??{};
        if(item.name==="element") { if(record.element) ggbFail("DUPLICATE_ELEMENT",`Duplicate element ${label}`); record.element=item; }
        else { if(record.expression!==undefined) ggbFail("DUPLICATE_EXPRESSION",`Duplicate expression ${label}`);record.expression=item.attributes.exp;record.expressionType=item.attributes.type; }
        this.records.set(label,record);
      } else if(item.name==="command") {
        const command={name:item.attributes.name??"",inputs:indexed(child(item,"input")),outputs:indexed(child(item,"output"))};
        if(!command.outputs.length) { this.issue("COMMAND_WITHOUT_OUTPUT",`Cannot import ${command.name}.`); continue; }
        for(const label of command.outputs) { const record=this.records.get(label)??{};if(record.command) ggbFail("DUPLICATE_PRODUCER",label);record.command=command;this.records.set(label,record); }
      } else this.issue("CONSTRUCTION_TAG_UNSUPPORTED",`Unsupported construction tag ${item.name}.`);
    }
    if(this.records.size>1500) ggbFail("OBJECT_LIMIT","At most 1500 source objects per import.");
    let index=0;
    for(const label of this.records.keys()) {
      // Keep source labels separate from evaluator identifiers (including Greek letters, primes and pi/e/x).
      this.labels[label]=`ggb${index++}`;
    }
  }
  issue(code:string,message:string,label?:string,severity:"error"|"warning"="error") { this.diagnostics.push({code,message,label,severity}); }
  helper() { if(++this.expansions>6000) ggbFail("EXPANSION_LIMIT","Construction expansion limit exceeded.");return `ggbAux${++this.serial}`; }
  emit(id:string,type:EntityType,command:string,inputs:string[]=[],params:Record<string,JsonValue>={},extraOutputs:string[]=[]):string {
    for(const output of [id,...extraOutputs]) {
      if(this.types.has(output)) ggbFail("DUPLICATE_OUTPUT",output);
      this.types.set(output,type);
      this.document.entities.push({id:output,type,role:"auxiliary",visible:false});
    }
    this.document.construction.push({id:`node${this.document.construction.length}`,command,inputs:inputs.map(ref=>({ref})),params,outputs:[id,...extraOutputs]});
    if (type === "line2") {
      if (command === "line.through_points") this.lineScales.set(id, `distance(${inputs[0]},${inputs[1]})`);
      else if (command === "line.parallel_through" || command === "line.perpendicular_through") {
        const scale = this.lineScales.get(inputs[1]!);
        if (scale !== undefined) this.lineScales.set(id, scale);
      }
    }
    return id;
  }
  expression(source:string, locals:string[]=[]):string {
    if(source.length>8192) ggbFail("EXPRESSION_LIMIT","Expression too long.");
    source=source.replace(/(?<![\p{L}\p{N}_])((?:\d+\.?\d*|\.\d+))[eE]([+-]?\d+)(?![\p{L}\p{N}_])/gu,"($1*10^($2))");
    const tokens=source.replaceAll("−","-").replaceAll("×","*").replaceAll("·","*").replaceAll("÷","/").replaceAll("π","pi").replaceAll("°","*(pi/180)")
      .replaceAll("≤","<=").replaceAll("≥",">=").replaceAll("≠","!=").replaceAll("∧","&&").replaceAll("∨","||");
    const translated=tokens.replace(/[\p{L}_][\p{L}\p{N}_]*(?:\{\d+\})?['′]*/gu,(name,offset:number,whole:string)=>{
      if(locals.includes(name)) return name;
      const call=/^\s*\(/.test(whole.slice(offset+name.length));
      if(call && names.has(name.toLowerCase())) return name.toLowerCase();
      if(this.records.has(name)) {if(call) ggbFail("FUNCTION_CALL_UNSUPPORTED", `User function call ${name} requires an explicit function composition.`);const id=this.ensure(name);return this.types.get(id)==="angle"?`value(${id})`:id;}
      if(["pi","e","true","false"].includes(name)) return name;
      if(call && names.has(name.toLowerCase())) return name.toLowerCase();
      return ggbFail("EXPRESSION_NAME_UNSUPPORTED",`Unsupported identifier/function '${name}'.`);
    });
    const ast=parseExpression(translated);
    const print=(node:ExpressionNode):string=>{
      if(node.type==="number"||node.type==="boolean") return String(node.value);
      if(node.type==="identifier") return node.name;
      if(node.type==="unary") return `(${node.operator}${print(node.argument)})`;
      if(node.type==="binary") return `(${print(node.left)}${node.operator}${print(node.right)})`;
      if(node.callee==="log"&&node.arguments.length===1) return `(ln(${print(node.arguments[0]!)})/ln(10))`;
      if(node.callee==="log"&&node.arguments.length===2) return `(ln(${print(node.arguments[1]!)})/ln(${print(node.arguments[0]!)}))`;
      return `${node.callee}(${node.arguments.map(print).join(",")})`;
    };
    return print(ast);
  }
  scalarExpression(id:string, source:string):string {
    const expression=this.expression(source);
    const dependencies=[...collectExpressionIdentifiers(parseExpression(expression))].filter(n=>n!=="pi"&&n!=="e");
    if(!dependencies.length) return this.emit(id,"scalar","scalar.constant",[],{value:evaluateNumericExpression(expression,()=>undefined)});
    // An existing constant-in-x function and its value_at node compose a derived scalar. No new evaluator is introduced.
    const fn=this.emit(this.helper(),"function1","function.explicit",[],{expression,domain:[0,1],variable:"x"});
    const zero=this.emit(this.helper(),"scalar","scalar.constant",[],{value:0});
    return this.emit(id,"scalar","function.value_at",[fn,zero]);
  }
  argument(raw:string):string {
    if(this.records.has(raw)) return this.ensure(raw);
    if(raw==="xAxis"||raw==="yAxis") {
      const a=this.emit(this.helper(),"point2","point.free",[],{coords:[0,0]});
      const b=this.emit(this.helper(),"point2","point.free",[],{coords:raw==="xAxis"?[1,0]:[0,1]});
      return this.emit(this.helper(),"line2","line.through_points",[a,b]);
    }
    const id=this.helper();
    if(raw.startsWith("(")&&raw.endsWith(")")) {
      const parts=splitGeoGebraArguments(raw.slice(1,-1));
      if(parts.length===2) return this.emit(id,"point2","point.from_expressions",[],{x:this.expression(parts[0]!),y:this.expression(parts[1]!)});
    }
    return this.scalarExpression(id,raw);
  }
  type(id:string):EntityType { const t=this.types.get(id);if(!t) ggbFail("MISSING_TYPE",id);return t; }
  need(ids:string[],types:Array<EntityType|Set<EntityType>>):void {
    if(ids.length!==types.length||ids.some((id,i)=>typeof types[i]==="string"?this.type(id)!==types[i]:!(types[i] as Set<EntityType>).has(this.type(id))))
      ggbFail("OVERLOAD_UNSUPPORTED",`Unsupported argument types (${ids.map(id=>this.type(id)).join(", ")}).`);
  }
  ensure(label:string):string {
    const id=this.labels[label]; if(!id) ggbFail("MISSING_LABEL",label);
    if(this.state.get(label)==="done") return id;
    if(this.state.get(label)==="busy") ggbFail("CONSTRUCTION_CYCLE",label);
    if(this.state.get(label)==="failed") ggbFail("DEPENDENCY_UNSUPPORTED",label);
    this.state.set(label,"busy");
    try {
      const record=this.records.get(label)!;
      if(record.command) {
        const command=record.command;
        for(const out of command.outputs) if(out!==label&&this.state.get(out)==="busy") ggbFail("CONSTRUCTION_CYCLE",out);
        this.command(command);
        for(const out of command.outputs) this.state.set(out,"done");
      } else { this.freeOrExpression(id,record);this.state.set(label,"done"); }
      return id;
    } catch(error) {
      this.state.set(label,"failed");
      if(error instanceof GgbImportError) throw error;
      throw new GgbImportError("INVALID_CONSTRUCTION",errorMessage(error));
    }
  }
  freeOrExpression(id:string,record:RecordItem):void {
    const el=record.element; const type=el?.attributes.type ?? record.expressionType;
    const exp=record.expression;
    if(type==="vector") {
      let x:string, y:string;
      if(exp!==undefined) {
        const tuple=exp.trim();
        if(!tuple.startsWith("(")||!tuple.endsWith(")")) ggbFail("VECTOR_EXPRESSION_UNSUPPORTED",exp);
        const parts=splitGeoGebraArguments(tuple.slice(1,-1));
        if(parts.length!==2) ggbFail("VECTOR_DIMENSION","Expected two vector components.");
        x=this.expression(parts[0]!);y=this.expression(parts[1]!);
      } else {
        const coords=child(el,"coords")?.attributes;if(!coords) ggbFail("VECTOR_COORDS","Missing vector coordinates.");
        x=String(numeric(coords.x));y=String(numeric(coords.y));
      }
      // Reuse the public vector primitive and hidden expression endpoints: the vector
      // stays vector2, follows dependencies, and renders as an arrow in both backends.
      const origin=this.emit(this.helper(),"point2","point.free",[],{coords:[0,0]});
      const endpoint=this.emit(this.helper(),"point2","point.from_expressions",[],{x,y});
      this.emit(id,"vector2","vector.between_points",[origin,endpoint]);
    } else if(type==="point" || (!type&&exp?.startsWith("(")&&exp.endsWith(")")&&splitGeoGebraArguments(exp.slice(1,-1)).length===2)) {
      if(exp!==undefined) {
        if(!exp.startsWith("(")||!exp.endsWith(")")) ggbFail("POINT_EXPRESSION_UNSUPPORTED",exp);
        const parts=splitGeoGebraArguments(exp.slice(1,-1));if(parts.length!==2) ggbFail("POINT_DIMENSION","Expected two coordinates.");
        const x=this.expression(parts[0]!);const y=this.expression(parts[1]!);
        const deps=[...collectExpressionIdentifiers(parseExpression(x)),...collectExpressionIdentifiers(parseExpression(y))].filter(n=>n!=="pi"&&n!=="e");
        if(!deps.length) this.emit(id,"point2","point.free",[],{coords:[evaluateNumericExpression(x,()=>undefined),evaluateNumericExpression(y,()=>undefined)]});
        else this.emit(id,"point2","point.from_expressions",[],{x,y});
      } else {
        const coords=child(el,"coords")?.attributes; if(!coords) ggbFail("POINT_COORDS","Missing free point coordinates.");
        const z=coords.z===undefined?1:numeric(coords.z);if(z===0) ggbFail("POINT_AT_INFINITY","Point at infinity is unsupported.");
        this.emit(id,"point2","point.free",[],{coords:[numeric(coords.x)/z,numeric(coords.y)/z]});
      }
    } else if(type==="line") {
      let a:number,b:number,c:number;
      if(exp!==undefined) {
        const sides=exp.split("=");
        if(sides.length!==2||sides.some(side=>!side.trim())) ggbFail("LINE_EQUATION_UNSUPPORTED","Expected one affine equation.");
        [a,b,c]=independentLineCoefficients(this.expression(sides[0]!,["x","y"]),this.expression(sides[1]!,["x","y"]));
      } else {
        const coords=child(el,"coords")?.attributes;if(!coords) ggbFail("LINE_COORDS","A free line requires homogeneous coefficients.");
        a=numeric(coords.x);b=numeric(coords.y);c=numeric(coords.z);
      }
      if(a===0&&b===0) ggbFail("DEGENERATE_LINE","Zero line normal.");
      const origin=this.emit(this.helper(),"point2","point.free",[],{coords:Math.abs(a)>Math.abs(b)?[-c/a,0]:[0,-c/b]});
      const end=this.emit(this.helper(),"point2","point.from_expressions",[],{x:`x(${origin})+(${b})`,y:`y(${origin})-(${a})`});
      this.emit(id,"line2","line.through_points",[origin,end]);
    } else if(type==="numeric"||type==="angle"||(!type&&exp!==undefined)) {
      const value=child(el,"value")?.attributes.val;
      const slider=child(el,"slider");const interval=child(el,"interval")?.attributes ?? (slider?.attributes.min !== undefined ? slider.attributes : undefined);
      if(slider&&interval&&(exp===undefined||Number.isFinite(Number(exp)))) {
        this.emit(id,"scalar","scalar.slider",[],{value:numeric(value),min:numeric(interval.min),max:numeric(interval.max),step:Number(child(el,"animation")?.attributes.step??0.1)});
      } else if(exp!==undefined) this.scalarExpression(id,exp);
      else this.emit(id,"scalar","scalar.constant",[],{value:numeric(value)});
    } else if(type==="boolean") {
      if(exp!==undefined) this.emit(id,"boolean","boolean.expression",[],{expression:this.expression(exp)});
      else this.emit(id,"boolean","boolean.constant",[],{value:child(el,"value")?.attributes.val==="true"});
    } else if(type==="function"&&exp!==undefined) {
      const view=this.document.views[0]!;const bounds=view.kind==="graphics2d"?view.boundingBox:[-10,10,10,-10];
      this.emit(id,"function1","function.explicit",[],{expression:this.expression(exp.replace(/^\s*[^=]+\(\s*x\s*\)\s*=\s*/,""),["x"]),variable:"x",domain:[bounds[0]!,bounds[2]!]});
      this.issue("FINITE_FUNCTION_DOMAIN","Graphing domain is restricted to the declared view bounds.",undefined,"warning");
    } else if(type==="text"&&exp?.startsWith('"')&&exp.endsWith('"')) {
      const text=JSON.parse(exp) as unknown;if(typeof text!=="string") ggbFail("TEXT_UNSUPPORTED","Expected a plain string.");
      this.emit(id,"text","text.at",[],{text,at:[0,0]});
      this.issue("TEXT_PLACEMENT","Text layout is not source-pixel-identical.",undefined,"warning");
    } else ggbFail("ELEMENT_UNSUPPORTED",`Cannot reconstruct ${type??"untyped"} without a supported defining command.`);
  }
  command(c:Command):void {
    const output=c.outputs.map(label=>this.labels[label]!);const id=output[0]!;
    const raw=c.inputs;
    const aliases:Record<string,string>={circulararc:"circlearc",circularsector:"circlesector",orthogonalline:"perpendicularline",linebisector:"perpendicularbisector",angularbisector:"anglebisector",mirror:"reflect",circumcircle:"circle",centre:"center"};
    const name=aliases[c.name.toLowerCase()]??c.name.toLowerCase();
    if(name==="curve") {
      if(raw.length!==5||output.length!==1) ggbFail("OVERLOAD_UNSUPPORTED","Curve expects x(t), y(t), t, start, end.");
      const parameter=raw[2]!;if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(parameter)) ggbFail("PARAMETER_UNSUPPORTED",parameter);
      const lo=evaluateNumericExpression(this.expression(raw[3]!),()=>undefined),hi=evaluateNumericExpression(this.expression(raw[4]!),()=>undefined);
      this.emit(id,"curve2","curve.parametric",[],{xExpression:this.expression(raw[0]!,[parameter]),yExpression:this.expression(raw[1]!,[parameter]),parameter,domain:[lo,hi]});return;
    }
    const args=raw.map(value=>this.argument(value));
    const one=()=>{if(output.length!==1) ggbFail("OUTPUT_ARITY",`${c.name}: unsupported output count ${output.length}`);};
    const point=(value:string)=>this.type(value)==="point2";
    switch(name) {
      case "point": {
        one();
        if(args.length===2&&point(args[0]!)&&this.type(args[1]!)==="vector2") {this.emit(id,"point2","transform.translate_point",args);return;}
        if(args.length!==1||!new Set<EntityType>(["line2","segment2","ray2","circle2","arc2","polygon2"]).has(this.type(args[0]!))) ggbFail("OVERLOAD_UNSUPPORTED","Point(path) and Point(point,vector) only; numeric GeoGebra path parameters have separate semantics.");
        const coords=child(this.records.get(c.outputs[0]!)?.element,"coords")?.attributes;
        if(!coords) ggbFail("PATH_POINT_STATE","A Point(path) command requires a saved finite position as initial constraint state.");
        const z=numeric(coords.z??"1");if(z===0) ggbFail("POINT_AT_INFINITY",c.outputs[0]!);
        const initial:[number,number]=[numeric(coords.x)/z,numeric(coords.y)/z];
        const scale=this.lineScales.get(args[0]!);
        const intrinsic=["segment2","ray2","circle2"].includes(this.type(args[0]!)) || (this.type(args[0]!)==="line2" && scale!==undefined);
        this.emit(id,"point2","point.on_path",args,{initial,...(intrinsic?{pathParameter:0,...(scale!==undefined?{pathScale:scale}:{})}:{})});
        if (intrinsic) {
          const node=this.document.construction.find(n=>n.outputs.includes(id))!;
          node.params={...node.params,...pathPointDragPatch(this.document,id,initial)};
        } else this.issue("PATH_PARAMETER_DIFFERENCE","This path producer has no verified intrinsic parameter mapping; legacy reprojection is retained.",c.outputs[0],"warning");
        return;
      }
      case "midpoint":one();
        if(args.length===1&&this.type(args[0]!)==="circle2") this.emit(id,"point2","point.circle_center",args);
        else {this.need(args,["point2","point2"]);this.emit(id,"point2","point.midpoint",args);}return;
      case "center":one();this.need(args,["circle2"]);this.emit(id,"point2","point.circle_center",args);return;
      case "line":one();if(args.length!==2) ggbFail("OVERLOAD_UNSUPPORTED","Line expects two arguments.");
        if(point(args[0]!)&&point(args[1]!)) this.emit(id,"line2","line.through_points",args);
        else {this.need(args,["point2",linear]);this.emit(id,"line2","line.parallel_through",args);}return;
      case "segment":one();this.need(args,["point2","point2"]);this.emit(id,"segment2","segment.through_points",args);return;
      case "ray":one();this.need(args,["point2","point2"]);this.emit(id,"ray2","ray.from_points",args);return;
      case "perpendicularline":case "parallelline":one();this.need(args,["point2",linear]);this.emit(id,"line2",name==="perpendicularline"?"line.perpendicular_through":"line.parallel_through",args);return;
      case "perpendicularbisector": {
        one();this.need(args,["point2","point2"]);
        const mid=this.emit(this.helper(),"point2","point.midpoint",args);const line=this.emit(this.helper(),"line2","line.through_points",args);
        this.emit(id,"line2","line.perpendicular_through",[mid,line]);return;
      }
      case "anglebisector": {
        one();this.need(args,["point2","point2","point2"]);const [a,b,d]=args;
        const end=this.emit(this.helper(),"point2","point.from_expressions",[],{
          x:`x(${b})+(x(${a})-x(${b}))/distance(${a},${b})+(x(${d})-x(${b}))/distance(${d},${b})`,
          y:`y(${b})+(y(${a})-y(${b}))/distance(${a},${b})+(y(${d})-y(${b}))/distance(${d},${b})`});
        this.emit(id,"line2","line.through_points",[b!,end]);this.lineScales.set(id,"1");return;
      }
      case "circle":one();
        if(args.length===3) {this.need(args,["point2","point2","point2"]);this.emit(id,"circle2","circle.through_three_points",args);}
        else if(args.length===2&&point(args[1]!)) {this.need(args,["point2","point2"]);this.emit(id,"circle2","circle.through_points",args);}
        else {this.need(args,["point2",scalar]);this.emit(id,"circle2","circle.center_radius",[args[0]!],{radius:this.scalarRef(args[1]!),allowPointCircle:true});}return;
      case "circlearc":case "circlesector": {
        one();this.need(args,["point2","point2","point2"]);
        const [center,start,direction]=args;
        // GeoGebra AlgoConicPartCircle projects its third point onto the circle.
        // Keep the stricter arc.center_points contract unchanged. This construction
        // expresses the projected endpoint in the original dependency graph.
        const angle=`atan2(y(${direction})-y(${center}),x(${direction})-x(${center}))`;
        const radius=`distance(${center},${start})`;
        const end=this.emit(this.helper(),"point2","point.from_expressions",[],{
          x:`x(${center})+${radius}*cos(${angle})`,y:`y(${center})+${radius}*sin(${angle})`});
        const arc=this.emit(name==="circlearc"?id:this.helper(),"arc2","arc.center_points",[center!,start!,end]);
        if(name==="circlesector") this.emit(id,"sector2","sector.from_arc",[arc]);
        return;
      }
      case "circumcirculararc":one();this.need(args,["point2","point2","point2"]);this.emit(id,"arc2","arc.three_points",args);return;
      case "polygon": {
        if(args.length<3||args.length>64||args.some(x=>!point(x))) ggbFail("OVERLOAD_UNSUPPORTED","Only Polygon(point, point, point, ...) is supported.");
        if(output.length!==1&&output.length!==args.length+1) ggbFail("OUTPUT_ARITY","Expected polygon plus optional edge outputs.");
        this.emit(id,"polygon2","polygon.vertices",args);
        for(let i=1;i<output.length;i++) this.emit(output[i]!,"segment2","segment.through_points",[args[i-1]!,args[i%args.length]!]);return;
      }
      case "ellipse":case "hyperbola": {
        one();if(args.length!==3||!point(args[0]!)||!point(args[1]!)) ggbFail("OVERLOAD_UNSUPPORTED",c.name);
        const [a,b,p]=args;
        const param=point(p!)?(name==="ellipse"?`distance(${a},${p})+distance(${b},${p})`:`abs(distance(${a},${p})-distance(${b},${p}))`):`2*(${this.scalarRef(p!)})`;
        this.emit(id,"conic2",name==="ellipse"?"conic.ellipse_foci":"conic.hyperbola_foci",[a!,b!],name==="ellipse"?{majorAxis:param}:{difference:param});return;
      }
      case "parabola":one();this.need(args,["point2",linear]);this.emit(id,"conic2","conic.parabola_focus_directrix",args);return;
      case "intersect": {
        if(args.length!==2&&args.length!==3) ggbFail("OVERLOAD_UNSUPPORTED","Only two-object intersections and literal one-based branch indices are imported.");
        const branch=args.length===3?Number(raw[2]):undefined;
        if(branch!==undefined&&(!Number.isInteger(branch)||branch<1||branch>2)) ggbFail("INTERSECTION_INDEX","Only a literal index 1 or 2 is supported; nearest-point/Newton variants need separate contracts.");
        let pair=args.slice(0,2);let command:string;let count:number;
        if(pair.every(x=>this.type(x)==="line2")) {command="point.intersection_line_line";count=1;}
        else if(pair.every(x=>this.type(x)==="circle2")) {command="point.intersection_circle_circle";count=2;}
        else {
          if(this.type(pair[1]!)==="line2") pair=[pair[1]!,pair[0]!];
          if(this.type(pair[0]!)!=="line2"||!["circle2","conic2"].includes(this.type(pair[1]!))) ggbFail("OVERLOAD_UNSUPPORTED","Bounded path/function intersections are not silently promoted to infinite lines.");
          command=this.type(pair[1]!)==="circle2"?"point.intersection_line_circle":"point.intersection_line_conic";count=2;
        }
        if(branch!==undefined) {
          if(branch>count||output.length!==1) ggbFail("OUTPUT_ARITY","Invalid indexed intersection output.");
          const first=this.helper(),second=count===2?this.helper():undefined;
          this.emit(first,"point2",command,pair,{},second?[second]:[]);
          const selected=branch===1?first:second!;
          this.emit(id,"point2","point.from_expressions",[],{x:`x(${selected})`,y:`y(${selected})`});
        } else {
          if(output.length!==count) ggbFail("OUTPUT_ARITY",`Expected ${count} intersection outputs.`);
          this.emit(id,"point2",command,pair,{},output.slice(1));
        }
        if(count===2) this.issue("INTERSECTION_BRANCH_ORDER","Native branch order is used; source drag-history continuity is not claimed.",c.outputs[0],"warning");return;
      }
      case "vector":one();this.need(args,["point2","point2"]);this.emit(id,"vector2","vector.between_points",args);return;
      case "closestpoint":one();this.need(args,[linear,"point2"]);this.emit(id,"point2","point.projection",[args[1]!,args[0]!]);return;
      case "distance": {
        one();if(args.length===2&&point(args[0]!)&&point(args[1]!)) this.emit(id,"scalar","measurement.distance",args);
        else {if(args.length===2&&linear.has(this.type(args[0]!))) args.reverse();this.need(args,["point2",linear]);const foot=this.emit(this.helper(),"point2","point.projection",args);this.emit(id,"scalar","measurement.distance",[args[0]!,foot]);}return;
      }
      case "radius":one();this.need(args,["circle2"]);this.emit(id,"scalar","measurement.circle_radius",args,{undefinedPolicy:"conic-axis-state"});return;
      case "slope":one();this.need(args,[linear]);this.emit(id,"scalar","measurement.slope",args);return;
      case "area":one();this.need(args,[new Set<EntityType>(["polygon2","circle2","sector2"])]);this.emit(id,"scalar","measurement.area",args);return;
      case "length":case "perimeter":one();if(args.length!==1) ggbFail("OVERLOAD_UNSUPPORTED",c.name);
        this.need(args,[new Set<EntityType>(["polygon2","circle2","arc2","segment2","vector2"])]);
        this.emit(id,"scalar",["segment2","vector2"].includes(this.type(args[0]!))?"measurement.segment_length":"measurement.perimeter",args);return;
      case "rotate":case "dilate":case "translate":case "reflect": {
        one();if(args.length<2||args.length>3) ggbFail("OVERLOAD_UNSUPPORTED",c.name);
        const object=args[0]!;const type=this.type(object);
        if(!["point2","vector2","line2","segment2","ray2","circle2","arc2","sector2","polygon2"].includes(type)) ggbFail("TRANSFORM_TYPE_UNSUPPORTED",type);
        let transform:string;
        if(name==="translate") {this.need(args,[new Set<EntityType>([type]),"vector2"]);transform=this.emit(this.helper(),"transform2","transform.translate",[args[1]!]);}
        else if(name==="reflect") {
          if(args.length!==2) ggbFail("OVERLOAD_UNSUPPORTED",c.name);
          if(this.type(args[1]!)==="circle2") {
            if(type!=="point2"&&type!=="circle2") ggbFail("INVERSION_TYPE_UNSUPPORTED",type);
            const declared=this.records.get(c.outputs[0]!)?.element?.attributes.type;
            if(type==="circle2"&&declared&&declared!=="conic") ggbFail("INVERSION_OUTPUT_TYPE_UNSUPPORTED",`Inversion produced ${declared}, not a conic. No circle or saved coordinates are substituted.`);
            this.emit(id,type,type==="point2"?"point.invert_in_circle":"circle.invert_in_circle",args);return;
          }
          if(point(args[1]!)) transform=this.emit(this.helper(),"transform2","transform.dilate",[args[1]!],{factor:-1});
          else {this.need([args[1]!],[linear]);transform=this.emit(this.helper(),"transform2","transform.reflect",[args[1]!]);}
        } else {
          this.need([args[1]!],[scalar]);const center=args[2]??this.emit(this.helper(),"point2","point.free",[],{coords:[0,0]});this.need([center],["point2"]);
          transform=this.emit(this.helper(),"transform2",name==="rotate"?"transform.rotate":"transform.dilate",[center],name==="rotate"?{angle:this.scalarRef(args[1]!)}:{factor:this.scalarRef(args[1]!)});
        }
        this.emit(id,type,"transform.apply",[object,transform]);return;
      }
      default:ggbFail("COMMAND_UNSUPPORTED",`Unsupported GeoGebra command '${c.name}'. No cached output is substituted.`);
    }
  }
  scalarRef(id:string):string {if(!scalar.has(this.type(id))) ggbFail("SCALAR_REQUIRED",id);return this.type(id)==="angle"?`value(${id})`:id;}
  decorate(label:string):void {
    const id=this.labels[label]!;const entity=this.document.entities.find(e=>e.id===id);if(!entity) ggbFail("OUTPUT_NOT_PRODUCED",label);
    const el=this.records.get(label)?.element;entity.label=label;entity.visible=child(el,"show")?.attributes.object!=="false";
    const node=this.document.construction.find(n=>n.outputs.includes(id))!;
    const free=["point.free","scalar.constant","scalar.slider","boolean.constant"].includes(node.command);
    const pathPoint=node.command==="point.on_path";
    entity.role=free?"free":"derived";
    if((free||pathPoint)&&child(el,"fixed")?.attributes.val!=="true") this.document.interactions!.push({target:id,permissions:entity.type==="point2"?["select","drag"]:["select","set_value"],...(pathPoint?{dragMode:"along_path" as const}: {})});
    const color=child(el,"objColor")?.attributes;const size=child(el,"lineStyle")?.attributes;const style:EntityStyle={labelVisible:child(el,"show")?.attributes.label==="true"};
    if(color) {const values=[numeric(color.r),numeric(color.g),numeric(color.b)];if(values.some(n=>n<0||n>255||!Number.isInteger(n))) ggbFail("COLOR_RANGE",label);style.stroke=`#${values.map(n=>n.toString(16).padStart(2,"0")).join("")}`;style.fill=style.stroke;if(color.alpha!==undefined) style.fillOpacity=Math.max(0,Math.min(1,numeric(color.alpha)));}
    if(size?.thickness!==undefined) style.strokeWidth=Math.max(0.5,Math.min(10,numeric(size.thickness)/2));
    if(size?.type&&size.type!=="0") style.dash="dashed";
    this.document.styles!.push({targets:[id],style});
    for(const n of el?.children??[]) {
      if(["ggbscript","javascript","script"].includes(n.name)) this.issue("SCRIPT_BLOCKED","Source scripts are never executed. Interactive behavior is not reconstructed.",label);
      if(n.name==="condition"&&n.attributes.showObject) {
        try {const b=this.emit(this.helper(),"boolean","boolean.expression",[],{expression:this.expression(n.attributes.showObject)});entity.visibleWhen=b;}
        catch(error) {this.issue("VISIBILITY_UNSUPPORTED",errorMessage(error),label);}
      }
      if(n.name==="animation"&&n.attributes.playing==="true") this.issue("ANIMATION_NOT_IMPORTED","Automatic animation requires an explicit FamTutor clock.",label,"warning");
    }
  }
  run():GeoGebraImportResult {
    for(const label of this.records.keys()) try {this.ensure(label);} catch(error) {this.issue(error instanceof GgbImportError?error.code:"IMPORT_ERROR",errorMessage(error),label);}
    // Visibility and styles are evaluated after the construction graph; a view reference is not a geometry dependency.
    for(const label of this.records.keys()) if(this.state.get(label)==="done") try {this.decorate(label);} catch(error) {this.issue("DECORATION_UNSUPPORTED",errorMessage(error),label);}
    const failedIds=new Set([...this.state].filter(([,state])=>state!=="done").map(([label])=>this.labels[label]!));
    this.document.entities=this.document.entities.filter(e=>!failedIds.has(e.id));
    this.document.construction=this.document.construction.filter(n=>!n.outputs.some(id=>failedIds.has(id)));
    // A partial preview may remove a failed dependency subtree, never substitute cached output geometry.
    let removed=true;
    while(removed) {
      removed=false;const present=new Set(this.document.entities.map(e=>e.id));
      for(const node of this.document.construction) {
        const refs=(node.inputs??[]).flatMap(input=>"ref" in input?[input.ref]:[]);
        for(const param of Object.values(node.params??{})) if(typeof param==="string") {
          for(const id of param.match(/ggb(?:Aux)?\d+/g)??[]) refs.push(id);
        }
        if(refs.some(id=>!present.has(id))) {
          this.document.entities=this.document.entities.filter(e=>!node.outputs.includes(e.id));removed=true;
        }
      }
      const remaining=new Set(this.document.entities.map(e=>e.id));
      this.document.construction=this.document.construction.filter(node=>node.outputs.every(id=>remaining.has(id)));
    }
    const present=new Set(this.document.entities.map(e=>e.id));
    this.document.styles=this.document.styles!.filter(s=>s.targets.every(id=>present.has(id)));
    this.document.interactions=this.document.interactions!.filter(i=>present.has(i.target));
    let graphValid=true;
    try {buildConstructionGraph(this.document);const result=evaluateMathDocument(this.document);
      for(const issue of result.issues) {
        const structural=["UNKNOWN_COMMAND","TYPE_MISMATCH","OUTPUT_TYPE_MISMATCH","INVALID_PARAMETER","MISSING_PARAMETER","EXPRESSION_PARSE_ERROR","UNKNOWN_IDENTIFIER","UNKNOWN_FUNCTION"].includes(issue.code);
        this.issue(issue.code,issue.message,undefined,structural?"error":"warning");
      }
    } catch(error) {graphValid=false;this.issue("GRAPH_INVALID",errorMessage(error));}
    const completed=new Set([...this.state].filter(([label,state])=>state==="done"&&present.has(this.labels[label]!)).map(([label])=>label));
    const hasErrors=this.diagnostics.some(d=>d.severity==="error");
    return {schema:"famtutor.geogebra.import.v1",status:!graphValid?"rejected":hasErrors?(this.options.allowPartial?"partial":"rejected"):"ready",
      ...(graphValid&&(!hasErrors||this.options.allowPartial)?{document:this.document}:{}),labels:this.labels,diagnostics:this.diagnostics,
      source:{format:this.root.attributes.format??"unknown",version:this.root.attributes.version??"unknown",declaredObjects:this.records.size,importedObjects:completed.size,scriptsExecuted:false}};
  }
}
export function importGeoGebraXml(xml:string,options:GeoGebraImportOptions={}):GeoGebraImportResult {
  try {return new Compiler(parseGgbXml(xml),options).run();}
  catch(error) {return {schema:"famtutor.geogebra.import.v1",status:"rejected",labels:{},diagnostics:[{code:error instanceof GgbImportError?error.code:"IMPORT_ERROR",severity:"error",message:errorMessage(error)}],source:{format:"unknown",version:"unknown",declaredObjects:0,importedObjects:0,scriptsExecuted:false}};}
}
