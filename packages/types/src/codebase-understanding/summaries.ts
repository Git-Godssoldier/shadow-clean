import { z } from "zod";
import { CodebaseUnderstanding } from "@repo/db";

// Zod schemas for ShadowWiki data structure based on backend implementation
export const TreeNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  absPath: z.string(),
  relPath: z.string(),
  level: z.number(),
  children: z.array(z.string()),
  files: z.array(z.string()),
  summary: z.string().optional(),
});

export const IndexFileSchema = z.object({
  root: z.string(),
  nodes: z.record(z.string(), TreeNodeSchema),
});

export const ShadowWikiMetadataSchema = z.object({
  filesProcessed: z.number(),
  directoriesProcessed: z.number(),
  generatedAt: z.string(),
});

export const ShadowWikiContentSchema = z.object({
  rootSummary: z.string(),
  structure: IndexFileSchema,
  fileCache: z.record(z.string(), z.string()),
  metadata: ShadowWikiMetadataSchema,
});

// Export inferred types
export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type IndexFile = z.infer<typeof IndexFileSchema>;
export type ShadowWikiMetadata = z.infer<typeof ShadowWikiMetadataSchema>;
export type ShadowWikiContent = z.infer<typeof ShadowWikiContentSchema>;

// Simplified schema for the new Shadow Wiki implementation
export const TaskCodebaseUnderstandingSchema = z.object({
  id: z.string(),
  repoFullName: z.string(),
  repoUrl: z.string(),
  content: ShadowWikiContentSchema, // Now properly typed instead of z.any()
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TaskCodebaseUnderstanding = z.infer<
  typeof TaskCodebaseUnderstandingSchema
>;

// Legacy schema for backwards compatibility
export const CodebaseSummarySchema = z.object({
  id: z.string(),
  type: z.enum(["file_summary", "directory_summary", "repo_summary"]),
  fileName: z.string(),
  filePath: z.string(),
  language: z.string(),
  content: z.string(),
});

export const CodebaseSummariesSchema = z.array(CodebaseSummarySchema);

export type CodebaseSummary = z.infer<typeof CodebaseSummarySchema>;

export type CodebaseWithSummaries = CodebaseUnderstanding & {
  tasks: { id: string }[];
  summaries: CodebaseSummary[];
};
