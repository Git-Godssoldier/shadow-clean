# Code Indexing System

This directory contains the core logic for Shadow's code indexing, embedding, and retrieval system. It's responsible for parsing a repository, understanding its structure, and converting it into a searchable format for the agent.

### Core Workflow

1.  **Graph Construction (`graph.ts`, `indexer.ts`):**
    The system first builds a semantic graph of the codebase. `GraphNode` objects represent entities like files, classes, functions (symbols), and even documentation comments. `GraphEdge` objects define the relationships between them (e.g., `CONTAINS`, `CALLS`, `DOCS_FOR`). This graph provides a rich, structured representation of the code's architecture.

2.  **Chunking (`chunker.ts`):**
    To prepare for embedding, the graph's nodes (especially large code blocks) are broken down into smaller, semantically coherent "chunks." This ensures the embeddings capture fine-grained details and are sized appropriately for the language model's context window.

3.  **Embedding (`embedderWrapper.ts`, `embedding/`):**
    Each chunk is then passed to an embedding model (e.g., Jina, local transformers). This process converts the text/code of each chunk into a high-dimensional vector that numerically represents its semantic meaning.

4.  **Storage (Pinecone):**
    These vectors, along with their metadata (like file path and node ID), are uploaded to a vector database (Pinecone). This allows for efficient similarity searches. See `embedding/pineconeService.ts` for the Pinecone integration.

5.  **Retrieval (`codebase-retrieval.ts`):**
    When the agent needs to find relevant code, it queries this system. The query is embedded into a vector, and Pinecone returns the most similar vectors from the repository's index. This allows the agent to find code based on natural language descriptions of functionality, not just keyword matches.

### Key Components

- `indexer.ts`: Orchestrates the entire indexing pipeline, from cloning the repo to building the graph and writing the final data.
- `graph.ts`: Defines the core data structures (`Graph`, `GraphNode`, `GraphEdge`) for representing the codebase as a graph.
- `chunker.ts`: Implements the logic for splitting code nodes into smaller chunks for embedding.
- `embedderWrapper.ts`: Manages the process of generating vector embeddings for code chunks and provider integration.
- `codebase-retrieval.ts`: Provides the interface for querying the indexed data.
- `languages.ts`: Contains language-specific configurations, like tree-sitter parsers and symbol extraction queries.
- `extractors/`: Logic for extracting symbols and structure from different file types using tree-sitter.
- `embedding/`: Abstractions for different embedding providers and services like Pinecone.

This system effectively creates a "semantic search" engine for a given codebase, empowering the agent to understand and navigate code with high precision.
