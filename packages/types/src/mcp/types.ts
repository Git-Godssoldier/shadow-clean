/**
 * Shared MCP (Model Context Protocol) types used across backend and frontend
 */

/**
 * MCP tool metadata for tracking original and transformed names
 */
export interface MCPToolMeta {
  originalName: string;
  transformedName: string;
  serverName: string;
  toolName: string;
}

/**
 * MCP server configuration options
 */
export interface MCPServerConfig {
  name: string;
  transport: 'sse' | 'stdio' | 'http';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  enabled?: boolean;
}

/**
 * MCP connection status for monitoring
 */
export interface MCPConnectionStatus {
  serverName: string;
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
  toolCount: number;
}

/**
 * MCP client wrapper for managing connections
 */
export interface MCPClientWrapper {
  serverName: string;
  client: any; // MCP client instance (varies by transport)
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
}

/**
 * MCP tool information for display and management
 */
export interface MCPToolInfo {
  name: string;
  serverName: string;
  description: string;
}

/**
 * MCP tool wrapper that includes metadata and execution function
 */
export interface MCPToolWrapper {
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  description: string;
  parameters: unknown;
  meta: MCPToolMeta;
}