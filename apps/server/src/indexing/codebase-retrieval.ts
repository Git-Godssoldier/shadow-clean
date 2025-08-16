import PineconeHandler from "./embedding/pineconeService";
import {
  CodebaseSearchRequest,
  CodebaseSearchResponse,
} from "./codebase-types";

// Codebase retrieval for fine-grained code search
export async function retrieveCodeChunks(
  request: CodebaseSearchRequest
): Promise<CodebaseSearchResponse[]> {
  try {
    const pinecone = new PineconeHandler("shadow");
    return await pinecone.searchRecords(request);
  } catch (error) {
    console.error(`[CODEBASE_RETRIEVAL] Error retrieving code chunks: ${error}`);
    return [];
  }
}
