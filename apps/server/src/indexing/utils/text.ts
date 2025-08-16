export function computeLineOffsets(text: string): number[] {
  const offsets = [0];
  let idx = 0;
  while (true) {
    const nl = text.indexOf("\n", idx);
    if (nl === -1) break;
    offsets.push(nl + 1);
    idx = nl + 1;
  }
  return offsets;
}

export function posToByte(
  offsets: number[],
  line: number,
  column: number
): number {
  if (line < 0) line = 0;
  if (line >= offsets.length) line = offsets.length - 1;
  return (offsets[line] ?? 0) + column;
}

export function sliceByLoc(
  text: string,
  loc: { startLine: number; startCol: number; endLine: number; endCol: number }
): string {
  const offsets = computeLineOffsets(text);
  const start = posToByte(offsets, loc.startLine, loc.startCol);
  const end = posToByte(offsets, loc.endLine, loc.endCol);
  return text.slice(start, end);
}
