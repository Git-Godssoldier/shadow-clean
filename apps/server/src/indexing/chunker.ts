import { GraphNode, GraphNodeKind, Location, makeId } from "@/indexing/graph";
import { sliceByLoc } from "@/indexing/utils/text";
import { DEFAULT_MAX_LINES_PER_CHUNK } from "./constants";

interface Symbol {
  name: string;
  loc: Location;
  node: any;
}

interface FileNode {
  path: string;
}

interface ChunkOptions {
  repoId: string;
  fileNode: FileNode;
  sym: Symbol;
  lang: string;
  sourceText: string;
  maxLines?: number;
}

export function chunkSymbol({
  repoId,
  fileNode,
  sym,
  lang,
  sourceText,
  maxLines = DEFAULT_MAX_LINES_PER_CHUNK,
}: ChunkOptions): GraphNode[] {
  const lines = sourceText.split("\n");
  const len = sym.loc.endLine - sym.loc.startLine + 1;
  const chunks: GraphNode[] = [];

  if (len <= maxLines) {
    const code = sliceByLoc(sourceText, sym.loc);
    const id = makeId(
      repoId,
      fileNode.path,
      GraphNodeKind.CHUNK,
      sym.name,
      sym.loc
    );
    chunks.push(
      new GraphNode({
        id,
        kind: GraphNodeKind.CHUNK,
        name: sym.name,
        path: fileNode.path,
        lang,
        loc: sym.loc,
        code,
      })
    );
    return chunks;
  }

  // Subdivide by child named nodes as coarse blocks
  const childBlocks: Array<{ node: any; loc: Location }> = [];
  for (let i = 0; i < sym.node.namedChildCount; i++) {
    const c = sym.node.namedChild(i);
    const cLoc: Location = {
      startLine: c.startPosition.row,
      startCol: c.startPosition.column,
      endLine: c.endPosition.row,
      endCol: c.endPosition.column,
      byteStart: c.startIndex,
      byteEnd: c.endIndex,
    };
    const clen = cLoc.endLine - cLoc.startLine + 1;
    if (clen < maxLines) {
      childBlocks.push({ node: c, loc: cLoc });
    }
  }

  // If childBlocks empty or still too big → fallback sliding windows
  if (childBlocks.length === 0) {
    let start = sym.loc.startLine;
    let idx = 0;
    while (start <= sym.loc.endLine) {
      const end = Math.min(start + maxLines - 1, sym.loc.endLine);
      const loc: Location = {
        startLine: start,
        startCol: 0,
        endLine: end,
        endCol: 0,
        byteStart: 0,
        byteEnd: 0,
      };
      const code = lines.slice(start, end + 1).join("\n");
      const id = makeId(
        repoId,
        fileNode.path,
        GraphNodeKind.CHUNK,
        sym.name,
        loc
      );
      chunks.push(
        new GraphNode({
          id,
          kind: GraphNodeKind.CHUNK,
          name: `${sym.name}#${idx}`,
          path: fileNode.path,
          lang,
          loc,
          code,
          meta: { strategy: "sliding" },
        })
      );
      idx++;
      start = end + 1;
    }
    return chunks;
  }

  // Use childBlocks as chunk boundaries; merge adjacent tiny ones
  const merged: Array<{ node: any; loc: Location }> = [];
  let cur: { node: any; loc: Location } | null = null;
  for (const b of childBlocks) {
    if (!cur) {
      cur = { ...b };
      continue;
    }
    if (
      b.loc.startLine - cur.loc.endLine <= 2 &&
      b.loc.endLine - cur.loc.startLine < maxLines
    ) {
      cur.loc.endLine = b.loc.endLine; // merge
    } else {
      merged.push(cur);
      cur = { ...b };
    }
  }
  if (cur) merged.push(cur);

  let idx = 0;
  for (const m of merged) {
    const code = sliceByLoc(sourceText, m.loc);
    const id = makeId(
      repoId,
      fileNode.path,
      GraphNodeKind.CHUNK,
      sym.name,
      m.loc
    );
    chunks.push(
      new GraphNode({
        id,
        kind: GraphNodeKind.CHUNK,
        name: `${sym.name}#${idx}`,
        path: fileNode.path,
        lang,
        loc: m.loc,
        code,
        meta: { strategy: "ast" },
      })
    );
    idx++;
  }
  return chunks;
}
