export function walk(node: any, fn: (node: any) => void): void {
  fn(node);
  const nChildren = node.namedChildCount;
  for (let i = 0; i < nChildren; i++) {
    const child = node.namedChild(i);
    walk(child, fn);
  }
}

export function nodeLoc(node: any): {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  byteStart: number;
  byteEnd: number;
} {
  return {
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
    byteStart: node.startIndex,
    byteEnd: node.endIndex,
  };
}
