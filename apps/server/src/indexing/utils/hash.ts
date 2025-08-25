import { Location } from "@/indexing/graph";
import crypto from "crypto";
// Abstract hash generator
interface HashGenerator {
  generateHash(repoId: string): string;
}

// Default hash function
const getHash = (text: string, slice: number | null = null): string => {
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return slice ? hash.slice(0, slice) : hash;
};

function getNodeHash(
  repoId: string,
  path: string,
  kind: string,
  name: string,
  loc: Location = { startLine: 0, startCol: 0, endLine: 0, endCol: 0 }
) {
  const h = crypto.createHash("sha1");
  h.update(
    repoId +
      "|" +
      path +
      "|" +
      kind +
      "|" +
      name +
      "|" +
      (loc
        ? `${loc.startLine}:${loc.startCol}-${loc.endLine}:${loc.endCol}`
        : "")
  );
  return h.digest("hex");
}

export { getHash, getNodeHash };
export type { HashGenerator };
