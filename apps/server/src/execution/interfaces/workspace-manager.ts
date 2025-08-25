import { ToolExecutor } from "./tool-executor";
import {
  WorkspaceInfo,
  WorkspaceStatus,
  HealthStatus,
  TaskConfig,
} from "./types";

/**
 * WorkspaceManager interface abstracts workspace lifecycle management
 * for both local and remote execution modes
 */
export interface WorkspaceManager {
  /**
   * Prepare a workspace for a task (clone repo, setup environment, etc.)
   */
  prepareWorkspace(taskConfig: TaskConfig): Promise<WorkspaceInfo>;

  /**
   * Clean up a task's workspace
   */
  cleanupWorkspace(taskId: string): Promise<{ success: boolean; message: string }>;

  /**
   * Get the current status of a workspace
   */
  getWorkspaceStatus(taskId: string): Promise<WorkspaceStatus>;

  /**
   * Get the workspace path for a task
   */
  getWorkspacePath(taskId: string): string;

  /**
   * Check if a workspace exists for a task
   */
  workspaceExists(taskId: string): Promise<boolean>;

  /**
   * Get workspace size in bytes
   */
  getWorkspaceSize(taskId: string): Promise<number>;

  /**
   * Get a tool executor for the given task
   * This is the main integration point between workspace and tool execution
   */
  getExecutor(taskId: string): Promise<ToolExecutor>;

  /**
   * Health check for the workspace (especially important for remote mode)
   */
  healthCheck(taskId: string): Promise<HealthStatus>;

  /**
   * Check if this workspace manager supports remote execution
   */
  isRemote(): boolean;
}