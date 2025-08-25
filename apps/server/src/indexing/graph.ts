import { HashGenerator } from "@/indexing/utils/hash";
import crypto from "crypto";

interface Location {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  byteStart?: number;
  byteEnd?: number;
}

interface GraphJSON {
  repoId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export enum GraphEdgeKind {
  CONTAINS = "CONTAINS",
  DOCS_FOR = "DOCS_FOR",
  PART_OF = "PART_OF",
  NEXT_CHUNK = "NEXT_CHUNK",
  CALLS = "CALLS",
}

export enum GraphNodeKind {
  REPO = "REPO",
  FILE = "FILE",
  SYMBOL = "SYMBOL",
  COMMENT = "COMMENT",
  IMPORT = "IMPORT",
  CHUNK = "CHUNK",
}

interface GraphNodeConstructorParams {
  id: string;
  kind: GraphNodeKind; // CHUNK / FILE / REPO / SYMBOL / COMMENT / IMPORT
  name: string; // Symbol name
  path?: string; // File path
  lang?: string; // Language
  loc?: Location; // Start, end, byte
  signature?: string; // First line of code
  code?: string; // Code
  doc?: string; // Doc string
  meta?: Record<string, any>; // Additional Metadata
}

class GraphNode implements HashGenerator {
  public id: string; // repoId
  public kind: GraphNodeKind; // CHUNK / FILE / REPO
  public name: string; // Symbol name
  public path: string; // File path
  public lang: string; // Language
  public loc: Location; // Start, end, byte
  public signature: string; // First line of code
  public code: string; // Code
  public doc: string; // Doc string
  public meta: Record<string, any>; // Additional Metadata
  public embedding: number[]; // Embedding - defaults to empty

  constructor({
    id,
    kind,
    name,
    path = "",
    lang = "",
    loc = {
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 0,
      byteStart: 0,
      byteEnd: 0,
    },
    signature = "",
    code = "",
    doc = "",
    meta = {},
  }: GraphNodeConstructorParams) {
    this.id = id;
    this.kind = kind;
    this.name = name;
    this.path = path;
    this.lang = lang;
    this.loc = loc;
    this.signature = signature;
    this.code = code;
    this.doc = doc;
    this.meta = meta;
    this.embedding = [];
  }

  generateHash(repoId: string): string {
    const h = crypto.createHash("sha1");
    h.update(
      repoId +
        "|" +
        this.path +
        "|" +
        this.kind.toString() +
        "|" +
        this.name +
        "|" +
        this.signature +
        "|" +
        this.code +
        "|" +
        this.doc +
        "|" +
        `${this.loc.startLine}:${this.loc.startCol}-${this.loc.endLine}:${this.loc.endCol}`
    );
    return h.digest("hex");
  }
}

class GraphEdge {
  public from: string;
  public to: string;
  public kind: GraphEdgeKind;
  public meta: Record<string, any>;

  constructor({ from, to, kind, meta = {} }: GraphEdge) {
    this.from = from;
    this.to = to;
    this.kind = kind;
    this.meta = meta;
  }
}

class Graph {
  public repoId: string;
  public nodes: Map<string, GraphNode>;
  public adj: Map<string, GraphEdge[]>;
  public rev: Map<string, GraphEdge[]>;

  constructor(repoId: string) {
    this.repoId = repoId;
    this.nodes = new Map();
    this.adj = new Map();
    this.rev = new Map();
  }

  addNode(node: GraphNode): GraphNode {
    if (this.nodes.has(node.id)) {
      const existing = this.nodes.get(node.id);
      if (existing) return existing;
    }
    this.nodes.set(node.id, node);
    this.adj.set(node.id, []);
    this.rev.set(node.id, []);
    return node;
  }

  addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) return;

    this.adj.get(edge.from)?.push(edge);
    this.rev.get(edge.to)?.push(edge);
  }

  neighbors(id: string, filterKinds?: string[]): GraphNode[] {
    const edges = this.adj.get(id) || [];
    return edges
      .filter((e) => !filterKinds || filterKinds.includes(e.kind))
      .map((e) => this.nodes.get(e.to)!)
      .filter(Boolean);
  }

  incoming(id: string, filterKinds?: string[]): GraphNode[] {
    const edges = this.rev.get(id) || [];
    return edges
      .filter((e) => !filterKinds || filterKinds.includes(e.kind))
      .map((e) => this.nodes.get(e.from)!)
      .filter(Boolean);
  }

  get(id: string): GraphNode {
    return this.nodes.get(id)!;
  }

  graphToJSON(): GraphJSON {
    return {
      repoId: this.repoId,
      nodes: [...this.nodes.values()],
      edges: Array.from(this.adj.values()).flat(),
    };
  }

  JSONToGraph(obj: GraphJSON): Graph {
    const g = new Graph(obj.repoId);
    for (const n of obj.nodes) g.addNode(new GraphNode(n));
    for (const e of obj.edges) g.addEdge(new GraphEdge(e));
    return g;
  }
}

// DEPRECATED: use GraphNode.generateHash() instead
function makeId(
  repoId: string,
  path: string,
  kind: GraphNodeKind | GraphEdgeKind,
  name: string,
  loc: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  } | null
) {
  const h = crypto.createHash("sha1");
  h.update(
    repoId +
      "|" +
      path +
      "|" +
      kind.toString() +
      "|" +
      name +
      "|" +
      (loc
        ? `${loc.startLine}:${loc.startCol}-${loc.endLine}:${loc.endCol}`
        : "")
  );
  return h.digest("hex");
}

export { Graph, GraphEdge, GraphNode, makeId };
export type { GraphJSON, Location };
