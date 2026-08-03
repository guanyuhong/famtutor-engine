import { getCommandDefinition } from "../catalog/commands.js";
import { MathEngineError } from "../errors.js";
import { collectExpressionIdentifiers, parseExpression } from "../expression/parser.js";
import type { ConstructionNode, MathDocument } from "../types.js";
import { unique } from "../util.js";

export interface ConstructionGraph {
  nodeById: Map<string, ConstructionNode>;
  producerByEntity: Map<string, string>;
  outputsByNode: Map<string, string[]>;
  entityDependenciesByNode: Map<string, string[]>;
  nodeDependencies: Map<string, string[]>;
  dependentsByNode: Map<string, string[]>;
  order: string[];
  edges: Array<[string, string]>;
}

function refInputs(node: ConstructionNode): string[] {
  return (node.inputs ?? [])
    .filter((input): input is { ref: string } => "ref" in input)
    .map(input => input.ref);
}

function expressionDependencies(node: ConstructionNode, entityIds: Set<string>): string[] {
  const definition = getCommandDefinition(node.command);
  if (!definition?.expressionParams?.length) return [];
  const dependencies: string[] = [];
  const localVariables = new Set<string>();
  if (node.command === "function.explicit") localVariables.add(String(node.params?.variable ?? "x"));
  if (node.command === "curve.parametric") localVariables.add(String(node.params?.parameter ?? "t"));

  for (const key of definition.expressionParams) {
    const raw = node.params?.[key];
    if (typeof raw !== "string") continue;
    const identifiers = collectExpressionIdentifiers(parseExpression(raw));
    for (const identifier of identifiers) {
      const lowered = identifier.toLowerCase();
      if (lowered === "pi" || lowered === "e" || localVariables.has(identifier)) continue;
      if (entityIds.has(identifier)) dependencies.push(identifier);
    }
  }
  return dependencies;
}

export function constructionEntityDependencies(node: ConstructionNode, document: MathDocument): string[] {
  const entityIds = new Set(document.entities.map(entity => entity.id));
  return unique([...refInputs(node), ...expressionDependencies(node, entityIds)]);
}

export function buildConstructionGraph(document: MathDocument): ConstructionGraph {
  const nodeById = new Map<string, ConstructionNode>();
  const producerByEntity = new Map<string, string>();
  const outputsByNode = new Map<string, string[]>();

  for (const node of document.construction) {
    if (nodeById.has(node.id)) {
      throw new MathEngineError("DUPLICATE_NODE_ID", `Duplicate construction node '${node.id}'.`, {
        path: "$.construction",
        actual: node.id
      });
    }
    nodeById.set(node.id, node);
    outputsByNode.set(node.id, [...node.outputs]);
    for (const output of node.outputs) {
      const previous = producerByEntity.get(output);
      if (previous) {
        throw new MathEngineError("MULTIPLE_ENTITY_PRODUCERS", `Entity '${output}' is produced by both '${previous}' and '${node.id}'.`, {
          path: `$.construction.${node.id}.outputs`,
          actual: output
        });
      }
      producerByEntity.set(output, node.id);
    }
  }

  const entityDependenciesByNode = new Map<string, string[]>();
  const nodeDependencies = new Map<string, string[]>();
  const dependentsByNode = new Map<string, string[]>();
  const edges: Array<[string, string]> = [];

  for (const node of document.construction) {
    const entityDependencies = constructionEntityDependencies(node, document);
    entityDependenciesByNode.set(node.id, entityDependencies);
    const dependencies: string[] = [];
    for (const entityId of entityDependencies) {
      const producer = producerByEntity.get(entityId);
      if (!producer) {
        throw new MathEngineError("MISSING_ENTITY_PRODUCER", `Input entity '${entityId}' has no construction producer.`, {
          path: `$.construction.${node.id}.inputs`,
          actual: entityId
        });
      }
      if (producer === node.id) {
        throw new MathEngineError("SELF_DEPENDENCY", `Construction node '${node.id}' depends on its own output '${entityId}'.`, {
          path: `$.construction.${node.id}`
        });
      }
      dependencies.push(producer);
      edges.push([producer, node.id]);
      const dependents = dependentsByNode.get(producer) ?? [];
      dependents.push(node.id);
      dependentsByNode.set(producer, unique(dependents));
    }
    nodeDependencies.set(node.id, unique(dependencies));
    if (!dependentsByNode.has(node.id)) dependentsByNode.set(node.id, []);
  }

  const state = new Map<string, "visiting" | "visited">();
  const order: string[] = [];
  const stack: string[] = [];

  const visit = (nodeId: string): void => {
    const current = state.get(nodeId);
    if (current === "visited") return;
    if (current === "visiting") {
      const cycleStart = stack.indexOf(nodeId);
      const cycle = [...stack.slice(Math.max(0, cycleStart)), nodeId];
      throw new MathEngineError("CYCLIC_CONSTRUCTION", `Cyclic construction dependency: ${cycle.join(" -> ")}.`, {
        path: "$.construction",
        actual: cycle
      });
    }
    if (!nodeById.has(nodeId)) {
      throw new MathEngineError("MISSING_NODE", `Construction node '${nodeId}' does not exist.`, {
        path: "$.construction",
        actual: nodeId
      });
    }
    state.set(nodeId, "visiting");
    stack.push(nodeId);
    for (const dependency of nodeDependencies.get(nodeId) ?? []) visit(dependency);
    stack.pop();
    state.set(nodeId, "visited");
    order.push(nodeId);
  };

  for (const node of document.construction) visit(node.id);

  return {
    nodeById,
    producerByEntity,
    outputsByNode,
    entityDependenciesByNode,
    nodeDependencies,
    dependentsByNode,
    order,
    edges
  };
}

export function transitiveDependentNodes(graph: ConstructionGraph, startingNodeIds: Iterable<string>): string[] {
  const output = new Set<string>();
  const queue = [...startingNodeIds];
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of graph.dependentsByNode.get(current) ?? []) {
      if (output.has(dependent)) continue;
      output.add(dependent);
      queue.push(dependent);
    }
  }
  return [...output];
}
