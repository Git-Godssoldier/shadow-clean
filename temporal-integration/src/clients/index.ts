/**
 * Production-ready Client Configuration with Connection Optimization
 * Implements connection pooling, retry policies, and performance monitoring
 */

import { 
  Client, 
  Connection, 
  ConnectionOptions,
  WorkflowHandle,
  WorkflowStartOptions
} from '@temporalio/client';
// Note: OpenTelemetry interceptor can be added when package is available

import { 
  ClientConfig, 
  ConnectionPoolConfig,
  WorkflowExecutionConfig 
} from '../types';
import { RetryPolicies, ErrorHandler } from '../utils/error-handling';

// ============================================================================
// Connection Pool Manager
// ============================================================================

export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private connections = new Map<string, Connection>();
  private connectionConfigs = new Map<string, ConnectionOptions>();
  private poolConfig: ConnectionPoolConfig;

  private constructor(config: ConnectionPoolConfig) {
    this.poolConfig = config;
  }

  static getInstance(config?: ConnectionPoolConfig): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance && config) {
      ConnectionPoolManager.instance = new ConnectionPoolManager(config);
    }
    return ConnectionPoolManager.instance;
  }

  async getConnection(connectionId = 'default'): Promise<Connection> {
    let connection = this.connections.get(connectionId);
    
    if (!connection || connection.status === 'CLOSED') {
      connection = await this.createConnection(connectionId);
      this.connections.set(connectionId, connection);
    }

    return connection;
  }

  private async createConnection(connectionId: string): Promise<Connection> {
    const config = this.connectionConfigs.get(connectionId) || this.getDefaultConnectionOptions();
    
    try {
      const connection = await Connection.connect(config);
      
      // Set up connection monitoring
      this.setupConnectionMonitoring(connection, connectionId);
      
      console.log(`Connection established for: ${connectionId}`);
      return connection;
    } catch (error) {
      console.error(`Failed to create connection for ${connectionId}:`, error);
      throw ErrorHandler.wrapError(error, { connectionId });
    }
  }

  private getDefaultConnectionOptions(): ConnectionOptions {
    return {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      tls: process.env.NODE_ENV === 'production' ? {
        // Production TLS configuration
        clientCertPair: process.env.TEMPORAL_CLIENT_CERT_PATH ? {
          crt: require('fs').readFileSync(process.env.TEMPORAL_CLIENT_CERT_PATH),
          key: require('fs').readFileSync(process.env.TEMPORAL_CLIENT_KEY_PATH)
        } : undefined,
        serverNameOverride: process.env.TEMPORAL_SERVER_NAME,
        serverRootCACertificate: process.env.TEMPORAL_CA_CERT_PATH ? 
          require('fs').readFileSync(process.env.TEMPORAL_CA_CERT_PATH) : undefined
      } : undefined,
      
      // Connection tuning
      connectTimeout: '30s',
      rpcRetryOptions: {
        initialInterval: '1s',
        backoffCoefficient: 2,
        maximumInterval: '30s',
        maximumAttempts: 5
      },
      
      // Keep-alive settings
      keepAliveTime: '30s',
      keepAliveTimeout: '5s',
      keepAlivePermitWithoutCalls: true,
      
      // Channel arguments for connection optimization
      channelArgs: {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.http2.max_pings_without_data': 0,
        'grpc.http2.min_time_between_pings_ms': 10000,
        'grpc.http2.min_ping_interval_without_data_ms': 300000
      }
    };
  }

  private setupConnectionMonitoring(connection: Connection, connectionId: string): void {
    // Monitor connection health
    setInterval(async () => {
      try {
        if (connection.status === 'READY') {
          // Connection is healthy
          if (Math.random() < 0.01) { // 1% chance to avoid spam
            console.debug(`Connection ${connectionId} is healthy`);
          }
        } else {
          console.warn(`Connection ${connectionId} status: ${connection.status}`);
        }
      } catch (error) {
        console.error(`Connection monitoring error for ${connectionId}:`, error);
      }
    }, this.poolConfig.healthCheckIntervalMs || 30000);
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      await connection.close();
      this.connections.delete(connectionId);
      console.log(`Connection closed: ${connectionId}`);
    }
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.entries()).map(
      async ([id, connection]) => {
        try {
          await connection.close();
          console.log(`Connection closed: ${id}`);
        } catch (error) {
          console.error(`Error closing connection ${id}:`, error);
        }
      }
    );
    
    await Promise.allSettled(closePromises);
    this.connections.clear();
  }

  getConnectionStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    this.connections.forEach((connection, id) => {
      status[id] = connection.status;
    });
    return status;
  }
}

// ============================================================================
// Client Factory with Optimization
// ============================================================================

export class OptimizedClientFactory {
  private static clients = new Map<string, Client>();
  private static connectionPool: ConnectionPoolManager;

  static async initialize(config: ClientConfig): Promise<void> {
    this.connectionPool = ConnectionPoolManager.getInstance(config.connectionPool);
    console.log('Optimized client factory initialized');
  }

  static async createClient(
    clientId = 'default',
    config?: Partial<ClientConfig>
  ): Promise<Client> {
    let client = this.clients.get(clientId);
    
    if (!client) {
      client = await this.buildOptimizedClient(clientId, config);
      this.clients.set(clientId, client);
    }

    return client;
  }

  private static async buildOptimizedClient(
    clientId: string,
    config?: Partial<ClientConfig>
  ): Promise<Client> {
    const connection = await this.connectionPool.getConnection(config?.connectionId || clientId);
    
    const clientOptions = {
      connection,
      namespace: config?.namespace || process.env.TEMPORAL_NAMESPACE || 'default',
      
      // Add performance interceptors
      interceptors: {
        workflow: [
          () => new OpenTelemetryWorkflowClientInterceptor(),
          () => new ClientMetricsInterceptor(clientId),
          ...(config?.interceptors?.workflow || [])
        ]
      },
      
      // Data converter for serialization optimization
      dataConverter: config?.dataConverter,
      
      // Query options
      queryRejectCondition: config?.queryRejectCondition
    };

    const client = new Client(clientOptions);
    
    console.log(`Optimized client created: ${clientId}`);
    return client;
  }

  static getClient(clientId = 'default'): Client | undefined {
    return this.clients.get(clientId);
  }

  static async closeClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      // Note: Client doesn't have a close method, but we remove from cache
      this.clients.delete(clientId);
      console.log(`Client removed from cache: ${clientId}`);
    }
  }

  static async shutdown(): Promise<void> {
    this.clients.clear();
    if (this.connectionPool) {
      await this.connectionPool.closeAllConnections();
    }
    console.log('Client factory shutdown complete');
  }

  static getClientStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.clients.forEach((client, id) => {
      status[id] = true; // Client is available
    });
    return status;
  }
}

// ============================================================================
// Workflow Execution Manager
// ============================================================================

export class WorkflowExecutionManager {
  private executionMetrics = new Map<string, {
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    workflowType: string;
    executionCount: number;
  }>();

  async startWorkflow<T = any>(
    client: Client,
    workflowType: string,
    options: WorkflowStartOptions<any[]>,
    config?: WorkflowExecutionConfig
  ): Promise<WorkflowHandle<T>> {
    const executionId = options.workflowId || `${workflowType}-${Date.now()}`;
    
    // Apply execution optimizations
    const optimizedOptions = this.applyExecutionOptimizations(options, config);
    
    try {
      // Record execution start
      this.executionMetrics.set(executionId, {
        startTime: new Date(),
        status: 'running',
        workflowType,
        executionCount: 1
      });

      const handle = await client.workflow.start(workflowType, optimizedOptions);
      
      // Set up execution monitoring
      this.monitorExecution(handle, executionId);
      
      console.log(`Workflow started: ${workflowType} (${executionId})`);
      return handle;
    } catch (error) {
      this.updateExecutionStatus(executionId, 'failed');
      console.error(`Failed to start workflow ${workflowType}:`, error);
      throw ErrorHandler.wrapError(error, { workflowType, executionId });
    }
  }

  private applyExecutionOptimizations(
    options: WorkflowStartOptions<any[]>,
    config?: WorkflowExecutionConfig
  ): WorkflowStartOptions<any[]> {
    return {
      ...options,
      
      // Apply retry policy if not specified
      retry: options.retry || RetryPolicies.STANDARD,
      
      // Set execution timeout if not specified
      workflowExecutionTimeout: options.workflowExecutionTimeout || 
        config?.defaultExecutionTimeout || '1h',
      
      // Set run timeout if not specified
      workflowRunTimeout: options.workflowRunTimeout || 
        config?.defaultRunTimeout || '30m',
      
      // Set task timeout if not specified
      workflowTaskTimeout: options.workflowTaskTimeout || 
        config?.defaultTaskTimeout || '10s',
      
      // Enable cron schedule optimization if applicable
      cronSchedule: options.cronSchedule,
      
      // Memory optimization for large workflows
      memo: options.memo ? this.optimizeMemo(options.memo) : undefined,
      
      // Search attributes optimization
      searchAttributes: options.searchAttributes ? 
        this.optimizeSearchAttributes(options.searchAttributes) : undefined
    };
  }

  private optimizeMemo(memo: Record<string, unknown>): Record<string, unknown> {
    // Limit memo size to prevent performance issues
    const MAX_MEMO_SIZE = 32000; // 32KB limit
    const serialized = JSON.stringify(memo);
    
    if (serialized.length > MAX_MEMO_SIZE) {
      console.warn('Memo size exceeds recommended limit, truncating');
      // Keep only essential fields or truncate values
      const optimized: Record<string, unknown> = {};
      let currentSize = 0;
      
      for (const [key, value] of Object.entries(memo)) {
        const entrySize = JSON.stringify({ [key]: value }).length;
        if (currentSize + entrySize <= MAX_MEMO_SIZE) {
          optimized[key] = value;
          currentSize += entrySize;
        } else {
          break;
        }
      }
      
      return optimized;
    }
    
    return memo;
  }

  private optimizeSearchAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    // Ensure search attributes are properly typed and within limits
    const optimized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        // Convert to appropriate types for search
        if (typeof value === 'string' && value.length <= 2048) {
          optimized[key] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          optimized[key] = value;
        } else if (value instanceof Date) {
          optimized[key] = value;
        } else {
          // Skip complex objects that aren't searchable
          console.warn(`Skipping non-searchable attribute: ${key}`);
        }
      }
    }
    
    return optimized;
  }

  private monitorExecution<T>(handle: WorkflowHandle<T>, executionId: string): void {
    // Monitor workflow execution asynchronously
    handle.result()
      .then(() => {
        this.updateExecutionStatus(executionId, 'completed');
      })
      .catch((error) => {
        this.updateExecutionStatus(executionId, 'failed');
        console.error(`Workflow execution failed: ${executionId}`, error);
      });
  }

  private updateExecutionStatus(
    executionId: string, 
    status: 'completed' | 'failed' | 'cancelled'
  ): void {
    const execution = this.executionMetrics.get(executionId);
    if (execution) {
      execution.status = status;
      execution.endTime = new Date();
      
      const duration = execution.endTime.getTime() - execution.startTime.getTime();
      console.log(`Workflow ${status}: ${executionId} (${duration}ms)`);
    }
  }

  getExecutionMetrics(): Array<{
    id: string;
    startTime: Date;
    endTime?: Date;
    status: string;
    workflowType: string;
    duration?: number;
  }> {
    return Array.from(this.executionMetrics.entries()).map(([id, metrics]) => ({
      id,
      ...metrics,
      duration: metrics.endTime ? 
        metrics.endTime.getTime() - metrics.startTime.getTime() : undefined
    }));
  }

  cleanup(maxAge = 3600000): void { // Default 1 hour
    const cutoff = Date.now() - maxAge;
    
    for (const [id, metrics] of this.executionMetrics.entries()) {
      if (metrics.endTime && metrics.endTime.getTime() < cutoff) {
        this.executionMetrics.delete(id);
      }
    }
  }
}

// ============================================================================
// Client Metrics Interceptor
// ============================================================================

class ClientMetricsInterceptor {
  private requestCount = 0;
  private errorCount = 0;
  private lastRequestTime = Date.now();

  constructor(private clientId: string) {}

  async execute(input: any, next: any): Promise<any> {
    this.requestCount++;
    this.lastRequestTime = Date.now();
    
    const startTime = Date.now();
    
    try {
      const result = await next(input);
      
      const duration = Date.now() - startTime;
      if (duration > 5000) { // Log slow requests
        console.warn(`Slow client request detected: ${this.clientId}`, {
          operation: input.operation,
          duration: `${duration}ms`
        });
      }
      
      return result;
    } catch (error) {
      this.errorCount++;
      console.error(`Client request failed: ${this.clientId}`, {
        operation: input.operation,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getMetrics() {
    return {
      clientId: this.clientId,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      lastRequestTime: this.lastRequestTime
    };
  }
}

// ============================================================================
// High-Level Client API
// ============================================================================

export class TemporalClient {
  private client: Client;
  private executionManager: WorkflowExecutionManager;

  constructor(client: Client) {
    this.client = client;
    this.executionManager = new WorkflowExecutionManager();
  }

  static async create(
    clientId?: string,
    config?: Partial<ClientConfig>
  ): Promise<TemporalClient> {
    const client = await OptimizedClientFactory.createClient(clientId, config);
    return new TemporalClient(client);
  }

  async executeWorkflow<T = any>(
    workflowType: string,
    args: any[],
    options?: Partial<WorkflowStartOptions<any[]>>,
    config?: WorkflowExecutionConfig
  ): Promise<T> {
    const workflowOptions: WorkflowStartOptions<any[]> = {
      args,
      workflowId: options?.workflowId || `${workflowType}-${Date.now()}`,
      taskQueue: options?.taskQueue || process.env.TEMPORAL_TASK_QUEUE || 'default',
      ...options
    };

    const handle = await this.executionManager.startWorkflow<T>(
      this.client,
      workflowType,
      workflowOptions,
      config
    );

    return await handle.result();
  }

  async startWorkflow<T = any>(
    workflowType: string,
    args: any[],
    options?: Partial<WorkflowStartOptions<any[]>>,
    config?: WorkflowExecutionConfig
  ): Promise<WorkflowHandle<T>> {
    const workflowOptions: WorkflowStartOptions<any[]> = {
      args,
      workflowId: options?.workflowId || `${workflowType}-${Date.now()}`,
      taskQueue: options?.taskQueue || process.env.TEMPORAL_TASK_QUEUE || 'default',
      ...options
    };

    return await this.executionManager.startWorkflow<T>(
      this.client,
      workflowType,
      workflowOptions,
      config
    );
  }

  getExecutionMetrics() {
    return this.executionManager.getExecutionMetrics();
  }

  cleanup() {
    this.executionManager.cleanup();
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  ConnectionPoolManager,
  OptimizedClientFactory,
  WorkflowExecutionManager,
  TemporalClient
};

export default TemporalClient;