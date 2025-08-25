export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  url?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface MCPConnectionStatus {
  serverName: string;
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
  toolCount: number;
}

export interface MCPToolInfo {
  name: string;
  serverName: string;
  description?: string;
}

export interface MCPToolMeta {
  originalName: string;
  transformedName: string;
  serverName: string;
  toolName: string;
}

export interface MCPToolWrapper {
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  description: string;
  parameters: unknown; // JSON Schema object
  meta: MCPToolMeta;
}

export type MCPTransportType = "stdio" | "sse" | "http";

export interface MCPClientWrapper {
  serverName: string;
  client: any; // MCPClient from AI SDK
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
}
