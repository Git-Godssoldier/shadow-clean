/**
 * Embedding providers for CodeGraph.
 *
 * Providers:
 *   - 'jina-api'           -> Remote Jina Embedding API (recommended for quick start)
 *   - 'local-transformers' -> @xenova/transformers ONNX inference (offline)
 *   - 'cheap-hash'         -> deterministic fallback (no ML)
 *
 * Default provider = 'cheap-hash' (backward compat) unless overridden by indexer options.
 *
 * Jina v2 Base Code model details:
 *   * 161M param JinaBERT variant w/ ALiBi extrapolation to 8K tokens.
 *   * Trained on GitHub code + ~150M code QA/docstring pairs across ~30 PLs.
 *   * Use MEAN pooling over token embeddings; L2-normalize for cosine sim.
 */

import PineconeHandler from "./embedding/pineconeService";
import { GraphNode } from "./graph";
import { logger } from "./logger";
import { getNamespaceFromRepo } from "./utils/repository";
import { PineconeBatchRecord } from "./types";
import { IndexRepoOptions } from "@repo/types";

// Wrapper used to embed and upsert to Pinecone
async function embedAndUpsertToPinecone(
  nodes: GraphNode[],
  repo: string,
  options: Pick<IndexRepoOptions, 'clearNamespace'>
): Promise<number> {
  // Input: GraphNode[], repo: string, options: IndexRepoOptions
  // Upserts the records to Pinecone as PineconeBatchRecord[]
  // Output: num_uploaded_records?
  const { clearNamespace } = options;
  const pinecone = new PineconeHandler();
  const namespace = getNamespaceFromRepo(repo);
  logger.info(`[EMBEDDER_WRAPPER] Clear namespace if requested: ${clearNamespace}`);
  if (clearNamespace) {
    logger.info(`[EMBEDDER_WRAPPER] Clearing namespace: ${namespace}`);
    await pinecone.clearNamespace(namespace);
  }
  logger.info(`[EMBEDDER_WRAPPER] Starting chunking and embedding...`);
  // Chunk by line ranges and upload
  const recordChunks: GraphNode[][] = await pinecone.chunkRecords(nodes); // Input: GraphNode[], Output: GraphNode[][]
  logger.info(`[EMBEDDER_WRAPPER] Record chunks: ${recordChunks.length}`);
  let totalUploaded = 0;
  for (const recordChunk of recordChunks) {
    try {
      // Convert each chunk to Pinecone format
      const batchRecords: PineconeBatchRecord[] = recordChunk.map((chunk) => {
        try {
          const code = chunk.code || "";
          // The text field in Pinecone auto-embed also counts towards metadata size
          const truncatedCode = code.length > 5000 ? code.substring(0, 5000) + "..." : code;
          /* 
          if (code.length > 5000) {
            logger.info(`Truncating large code chunk for ${chunk.path} (${code.length} → 5000 chars)`);
          }
           */

          const record = {
            id: chunk.id,
            metadata: {
              code: truncatedCode,
              path: chunk.path,
              name: chunk.name,
              lang: chunk.lang,
              line_start: chunk.loc?.startLine || 0,
              line_end: chunk.loc?.endLine || 0,
              kind: chunk.kind,
              fullCode: code, // Keep full code for embedding generation
            },
          };
          /* 
          // Log record size for debugging
          const recordSize = JSON.stringify(record).length;
          if (recordSize > 35000) { // Log if approaching 40KB limit
            logger.warn(`Large record detected: ${chunk.path} (${recordSize} bytes) - ID: ${chunk.id}, codeLength: ${code.length}`);
          }
          */
          return record;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to process chunk for record creation - ID: ${chunk.id}, path: ${chunk.path}, error: ${errorMsg}`);
          throw error;
        }
      }); // Input: GraphNode[], Output: PineconeBatchRecord[]

      const uploaded = await pinecone.upsertAutoEmbed(batchRecords, namespace); // Input: PineconeBatchRecord[], Output: num_uploaded_records?
      totalUploaded += uploaded;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const chunkPaths = recordChunk.map(chunk => chunk.path).join(', ');
      logger.error(`Failed to upsert record chunk (${recordChunk.length} records) - paths: ${chunkPaths}, error: ${errorMsg}. Continuing with next chunk.`);
      // Continue processing other chunks instead of throwing
    }
  }
  logger.info(`[EMBEDDER_WRAPPER] Embedded and uploaded ${totalUploaded} chunks to Pinecone`);
  return totalUploaded;
}

export { embedAndUpsertToPinecone };
