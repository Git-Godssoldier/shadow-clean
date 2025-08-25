import { nodeLoc } from "./base";

export interface Definition {
  node: any;
  name: string;
  loc: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    byteStart: number;
    byteEnd: number;
  };
}

export interface Import {
  node: any;
  loc: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    byteStart: number;
    byteEnd: number;
  };
}

export interface Call {
  node: any;
  loc: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    byteStart: number;
    byteEnd: number;
  };
}

export interface Doc {
  node: any;
  loc: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    byteStart: number;
    byteEnd: number;
  };
}

export interface LanguageSpec {
  symbols: string[];
  imports: string[];
  calls?: string[];
  docs?: string[];
}

export function extractGeneric(
  root: any,
  spec: LanguageSpec,
  sourceText: string
): {
  defs: Definition[];
  imports: Import[];
  calls: Call[];
  docs: Doc[];
} {
  const defs: Definition[] = [];
  const imports: Import[] = [];
  const calls: Call[] = [];
  const docs: Doc[] = [];

  function collect(node: any): void {
    const t = node.type;
    if (spec.symbols.includes(t)) {
      // Get name heuristically: find first child that's an identifier
      let name: string | null = null;
      for (let i = 0; i < node.namedChildCount; i++) {
        const c = node.namedChild(i);
        if (/identifier|name|type_identifier|field_identifier/.test(c.type)) {
          name = c.text || sourceText.slice(c.startIndex, c.endIndex);
          break;
        }
      }
      if (!name) {
        // fallback to text slice limited
        name = sourceText
          .slice(node.startIndex, Math.min(node.startIndex + 32, node.endIndex))
          .trim();
      }
      defs.push({ node, name, loc: nodeLoc(node) });
    }
    if (spec.imports.includes(t)) {
      imports.push({ node, loc: nodeLoc(node) });
    }
    if (spec.calls && spec.calls.includes(t)) {
      calls.push({ node, loc: nodeLoc(node) });
    }
    if (spec.docs && spec.docs.includes(t)) {
      docs.push({ node, loc: nodeLoc(node) });
    }
    // no recursion here; caller handles
  }

  // manual stack to avoid recursion blowups
  const stack: any[] = [root];
  while (stack.length) {
    const n = stack.pop();
    collect(n);
    for (let i = 0; i < n.namedChildCount; i++) stack.push(n.namedChild(i));
  }

  return { defs, imports, calls, docs };
}
