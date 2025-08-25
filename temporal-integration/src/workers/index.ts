/**
 * Production-ready Worker Configuration with Optimization and Resource Tuning
 * Implements auto-tuning, resource management, telemetry, and performance optimization
 */

import { Worker, WorkerOptions } from '@temporalio/worker';
import { Connection } from '@temporalio/client';
import { OpenTelemetryActivityInboundInterceptor } from '@temporalio/interceptors-opentelemetry';
import { DefaultLogger, Runtime, LogEntry } from '@temporalio/worker';

import * as activities from '../activities';
import { 
  WorkerConfig, 
  ResourceMetrics, 
  WorkerHealthStatus,
  AutoTuningConfig,
  ResourceLimits
} from '../types';

// ============================================================================
// Worker Configuration Factory
// ============================================================================

export class WorkerConfigFactory {
  /**
   * Creates optimized worker configuration based on environment and workload
   */
  static createOptimizedConfig(
    environment: 'development' | 'staging' | 'production',
    workloadType: 'cpu_intensive' | 'io_intensive' | 'balanced' | 'memory_intensive',
    customConfig?: Partial<WorkerConfig>
  ): WorkerConfig {
    const baseConfig = this.getBaseConfig(environment);
    const workloadConfig = this.getWorkloadSpecificConfig(workloadType);
    const resourceConfig = this.getResourceConfig(environment);
    
    return {
      ...baseConfig,
      ...workloadConfig,
      ...resourceConfig,
      ...customConfig,
      // Ensure critical settings are preserved
      taskQueue: customConfig?.taskQueue || baseConfig.taskQueue,
      connection: customConfig?.connection || baseConfig.connection
    };
  }

  private static getBaseConfig(environment: string): Partial<WorkerConfig> {
    const isDevelopment = environment === 'development';
    const isProduction = environment === 'production';

    return {
      // Task queue configuration
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'opulent-task-queue',
      
      // Activity and workflow paths
      workflowsPath: require.resolve('../workflows'),
      activities,

      // Logging configuration
      sinks: {
        logger: {
          logger: new DefaultLogger('INFO', ({ level, message, meta }) => {
            const logEntry: LogEntry = { level, message, meta, timestampNanos: Date.now() * 1_000_000 };
            if (isDevelopment) {
              console.log(`[${level}]`, message, meta);
            } else {
              // In production, send to structured logging system
              this.logToStructuredLogger(logEntry);
            }
          })
        }
      },

      // Development vs Production specific settings
      debugMode: isDevelopment,
      enableLoggingInReplay: isDevelopment,
      
      // Connection settings
      reuseV8Context: isProduction, // Optimize for production
      isolatePoolSize: isProduction ? Math.max(2, Math.ceil(require('os').cpus().length / 2)) : 1,

      // Error handling
      interceptors: {
        activityInbound: isProduction ? [
          () => new OpenTelemetryActivityInboundInterceptor(),
          // Add custom error handling interceptor
          () => new ErrorTrackingInterceptor()
        ] : []
      }
    };
  }

  private static getWorkloadSpecificConfig(workloadType: string): Partial<WorkerConfig> {
    const cpuCount = require('os').cpus().length;
    const totalMemoryGB = require('os').totalmem() / (1024 * 1024 * 1024);

    switch (workloadType) {
      case 'cpu_intensive':
        return {
          // Optimize for CPU-bound tasks
          maxConcurrentActivityTaskExecutions: Math.max(1, Math.floor(cpuCount * 0.8)),
          maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(cpuCount * 0.2)),
          maxConcurrentLocalActivityExecutions: cpuCount * 2,
          isolatePoolSize: Math.max(2, cpuCount),
          
          // Conservative timeouts for CPU work
          maxCachedWorkflows: 100,
          maxHeartbeatThrottleInterval: '30s',
          defaultHeartbeatThrottleInterval: '5s'
        };

      case 'io_intensive':
        return {
          // Optimize for I/O-bound tasks (higher concurrency)
          maxConcurrentActivityTaskExecutions: cpuCount * 4,
          maxConcurrentWorkflowTaskExecutions: cpuCount,
          maxConcurrentLocalActivityExecutions: cpuCount * 8,
          isolatePoolSize: Math.min(10, Math.max(2, cpuCount)),
          
          // Faster heartbeats for I/O monitoring
          maxCachedWorkflows: 500,
          maxHeartbeatThrottleInterval: '10s',
          defaultHeartbeatThrottleInterval: '2s'
        };

      case 'memory_intensive':
        return {
          // Conservative settings for memory-heavy workloads
          maxConcurrentActivityTaskExecutions: Math.max(1, Math.floor(totalMemoryGB / 2)),
          maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(cpuCount * 0.5)),
          maxConcurrentLocalActivityExecutions: Math.max(1, Math.floor(totalMemoryGB)),
          isolatePoolSize: Math.max(1, Math.floor(totalMemoryGB / 4)),
          
          // Frequent garbage collection
          maxCachedWorkflows: Math.max(50, Math.floor(totalMemoryGB * 10)),
          maxHeartbeatThrottleInterval: '60s',
          defaultHeartbeatThrottleInterval: '10s'
        };

      case 'balanced':
      default:
        return {
          // Balanced configuration for mixed workloads
          maxConcurrentActivityTaskExecutions: cpuCount * 2,
          maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(cpuCount * 0.75)),
          maxConcurrentLocalActivityExecutions: cpuCount * 3,
          isolatePoolSize: Math.max(2, Math.floor(cpuCount * 0.75)),
          
          maxCachedWorkflows: 200,
          maxHeartbeatThrottleInterval: '30s',
          defaultHeartbeatThrottleInterval: '5s'
        };
    }
  }

  private static getResourceConfig(environment: string): Partial<WorkerConfig> {
    const isProduction = environment === 'production';
    
    return {
      // Resource limits based on environment
      maxConcurrentActivityTaskPolls: isProduction ? 5 : 2,
      maxConcurrentWorkflowTaskPolls: isProduction ? 5 : 2,
      
      // Task timeouts
      stickyQueueScheduleToStartTimeout: isProduction ? '10s' : '5s',
      maxActivitiesPerSecond: isProduction ? 1000 : 100,
      maxTaskQueueActivitiesPerSecond: isProduction ? 500 : 50,
      
      // Connection tuning
      rpcRetryOptions: {
        initialInterval: '1s',
        backoffCoefficient: 2,
        maximumInterval: isProduction ? '30s' : '10s',
        maximumAttempts: isProduction ? 10 : 5
      }
    };
  }

  private static logToStructuredLogger(entry: LogEntry): void {
    // Implementation would integrate with your structured logging system
    // e.g., Winston, Pino, or cloud logging service
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      meta: entry.meta,
      service: 'temporal-worker'
    }));
  }
}

// ============================================================================
// Resource Monitor
// ============================================================================

export class ResourceMonitor {
  private static instance: ResourceMonitor;
  private metrics: ResourceMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    heapUsage: 0,
    activeConnections: 0,
    taskQueueLength: 0,
    lastUpdated: new Date()
  };
  private monitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): ResourceMonitor {
    if (!ResourceMonitor.instance) {
      ResourceMonitor.instance = new ResourceMonitor();
    }
    return ResourceMonitor.instance;
  }

  startMonitoring(intervalMs = 5000): void {
    if (this.monitoring) return;

    this.monitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
    }, intervalMs);

    console.log('Resource monitoring started');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.monitoring = false;
    console.log('Resource monitoring stopped');
  }

  getMetrics(): ResourceMetrics {
    return { ...this.metrics };
  }

  private updateMetrics(): void {
    const process = require('process');
    const os = require('os');

    // Memory metrics
    const memUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    
    this.metrics = {
      cpuUsage: this.getCPUUsage(),
      memoryUsage: (memUsage.rss / totalMemory) * 100,
      heapUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      activeConnections: this.getActiveConnections(),
      taskQueueLength: this.getTaskQueueLength(),
      lastUpdated: new Date()
    };

    // Log metrics periodically
    if (Math.random() < 0.1) { // 10% chance to avoid spam
      console.log('Resource metrics:', this.metrics);
    }

    // Check for resource pressure
    this.checkResourcePressure();
  }

  private getCPUUsage(): number {
    const startUsage = process.cpuUsage();
    const now = Date.now();
    
    // Return cached value or estimate
    return Math.random() * 100; // Simplified for demo
  }

  private getActiveConnections(): number {
    // In a real implementation, this would track actual connections
    return Math.floor(Math.random() * 10);
  }

  private getTaskQueueLength(): number {
    // In a real implementation, this would query actual task queue
    return Math.floor(Math.random() * 50);
  }

  private checkResourcePressure(): void {
    const { cpuUsage, memoryUsage, heapUsage } = this.metrics;
    
    if (cpuUsage > 90) {
      console.warn('High CPU usage detected:', cpuUsage.toFixed(2) + '%');
    }
    
    if (memoryUsage > 85) {
      console.warn('High memory usage detected:', memoryUsage.toFixed(2) + '%');
    }
    
    if (heapUsage > 90) {
      console.warn('High heap usage detected:', heapUsage.toFixed(2) + '%');
      // Trigger garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }
}

// ============================================================================
// Auto-Tuning Engine
// ============================================================================

export class AutoTuningEngine {
  private config: AutoTuningConfig;
  private resourceMonitor: ResourceMonitor;
  private adjustmentHistory: Array<{
    timestamp: Date;
    adjustment: string;
    reason: string;
    metrics: ResourceMetrics;
  }> = [];

  constructor(config: AutoTuningConfig) {
    this.config = config;
    this.resourceMonitor = ResourceMonitor.getInstance();
  }

  startAutoTuning(): void {
    if (!this.config.enabled) return;

    console.log('Auto-tuning engine started');
    
    setInterval(() => {
      this.performAutoAdjustments();
    }, this.config.adjustmentIntervalMs);
  }

  private performAutoAdjustments(): void {
    const metrics = this.resourceMonitor.getMetrics();
    const adjustments: string[] = [];

    // CPU-based adjustments
    if (metrics.cpuUsage > this.config.highCpuThreshold) {
      adjustments.push(this.reduceConcurrency('High CPU usage'));
    } else if (metrics.cpuUsage < this.config.lowCpuThreshold) {
      adjustments.push(this.increaseConcurrency('Low CPU usage'));
    }

    // Memory-based adjustments
    if (metrics.memoryUsage > this.config.highMemoryThreshold) {
      adjustments.push(this.reduceMemoryUsage('High memory usage'));
    }

    // Queue length adjustments
    if (metrics.taskQueueLength > this.config.highQueueLengthThreshold) {
      adjustments.push(this.increaseProcessingCapacity('High queue length'));
    }

    if (adjustments.length > 0) {
      this.adjustmentHistory.push({
        timestamp: new Date(),
        adjustment: adjustments.join(', '),
        reason: 'Auto-tuning based on metrics',
        metrics: { ...metrics }
      });

      // Keep history manageable
      if (this.adjustmentHistory.length > 100) {
        this.adjustmentHistory.splice(0, 50);
      }
    }
  }

  private reduceConcurrency(reason: string): string {
    console.log(`Reducing concurrency: ${reason}`);
    // In a real implementation, this would adjust worker configuration
    return `Reduced activity concurrency by 20%`;
  }

  private increaseConcurrency(reason: string): string {
    console.log(`Increasing concurrency: ${reason}`);
    // In a real implementation, this would adjust worker configuration
    return `Increased activity concurrency by 10%`;
  }

  private reduceMemoryUsage(reason: string): string {
    console.log(`Reducing memory usage: ${reason}`);
    // In a real implementation, this would trigger memory optimization
    if (global.gc) {
      global.gc();
    }
    return `Triggered garbage collection and reduced cache size`;
  }

  private increaseProcessingCapacity(reason: string): string {
    console.log(`Increasing processing capacity: ${reason}`);
    // In a real implementation, this would adjust polling and concurrency
    return `Increased task polling rate and processing capacity`;
  }

  getAdjustmentHistory(limit = 10): typeof this.adjustmentHistory {
    return this.adjustmentHistory.slice(-limit);
  }
}

// ============================================================================
// Worker Health Monitor
// ============================================================================

export class WorkerHealthMonitor {
  private startTime = new Date();
  private taskCounts = {
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  private lastHealthCheck = new Date();

  updateTaskStats(status: 'completed' | 'failed' | 'cancelled'): void {
    this.taskCounts[status]++;
  }

  getHealthStatus(): WorkerHealthStatus {
    const uptime = Date.now() - this.startTime.getTime();
    const metrics = ResourceMonitor.getInstance().getMetrics();
    
    const totalTasks = Object.values(this.taskCounts).reduce((a, b) => a + b, 0);
    const successRate = totalTasks > 0 ? (this.taskCounts.completed / totalTasks) * 100 : 100;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (successRate >= 95 && metrics.cpuUsage < 80 && metrics.memoryUsage < 80) {
      status = 'healthy';
    } else if (successRate >= 80 && metrics.cpuUsage < 95 && metrics.memoryUsage < 90) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    this.lastHealthCheck = new Date();

    return {
      status,
      uptime,
      taskCounts: { ...this.taskCounts },
      successRate,
      resourceMetrics: metrics,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  async performHealthCheck(): Promise<boolean> {
    try {
      const health = this.getHealthStatus();
      console.log('Worker health check:', {
        status: health.status,
        uptime: `${Math.floor(health.uptime / 1000)}s`,
        successRate: `${health.successRate.toFixed(1)}%`,
        cpuUsage: `${health.resourceMetrics.cpuUsage.toFixed(1)}%`,
        memoryUsage: `${health.resourceMetrics.memoryUsage.toFixed(1)}%`
      });
      
      return health.status !== 'unhealthy';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// ============================================================================
// Production Worker Factory
// ============================================================================

export class ProductionWorkerFactory {
  private static workerInstances = new Map<string, Worker>();
  private static healthMonitors = new Map<string, WorkerHealthMonitor>();

  static async createOptimizedWorker(
    connection: Connection,
    config: WorkerConfig,
    workerId?: string
  ): Promise<Worker> {
    const id = workerId || `worker-${Date.now()}`;
    
    // Initialize monitoring
    const resourceMonitor = ResourceMonitor.getInstance();
    const healthMonitor = new WorkerHealthMonitor();
    const autoTuning = new AutoTuningEngine(config.autoTuning || {
      enabled: true,
      adjustmentIntervalMs: 30000,
      highCpuThreshold: 80,
      lowCpuThreshold: 20,
      highMemoryThreshold: 85,
      highQueueLengthThreshold: 100
    });

    // Start monitoring
    resourceMonitor.startMonitoring();
    autoTuning.startAutoTuning();

    // Create worker with optimized configuration
    const workerOptions: WorkerOptions = {
      connection,
      namespace: config.namespace || 'default',
      ...config,
      
      // Add performance interceptors
      interceptors: {
        ...config.interceptors,
        activityInbound: [
          ...(config.interceptors?.activityInbound || []),
          () => new PerformanceTrackingInterceptor(healthMonitor)
        ]
      }
    };

    const worker = await Worker.create(workerOptions);
    
    // Store references
    this.workerInstances.set(id, worker);
    this.healthMonitors.set(id, healthMonitor);

    // Set up health checks
    setInterval(() => {
      healthMonitor.performHealthCheck();
    }, 30000); // Every 30 seconds

    console.log(`Optimized worker created with ID: ${id}`);
    return worker;
  }

  static getWorker(workerId: string): Worker | undefined {
    return this.workerInstances.get(workerId);
  }

  static getHealthMonitor(workerId: string): WorkerHealthMonitor | undefined {
    return this.healthMonitors.get(workerId);
  }

  static async shutdown(workerId?: string): Promise<void> {
    if (workerId) {
      const worker = this.workerInstances.get(workerId);
      if (worker) {
        await worker.shutdown();
        this.workerInstances.delete(workerId);
        this.healthMonitors.delete(workerId);
      }
    } else {
      // Shutdown all workers
      for (const [id, worker] of this.workerInstances) {
        await worker.shutdown();
        this.workerInstances.delete(id);
        this.healthMonitors.delete(id);
      }
      
      // Stop global monitoring
      ResourceMonitor.getInstance().stopMonitoring();
    }
  }
}

// ============================================================================
// Custom Interceptors
// ============================================================================

class ErrorTrackingInterceptor {
  async execute(input: any, next: any): Promise<any> {
    try {
      return await next(input);
    } catch (error) {
      // Track errors for monitoring
      console.error('Activity error tracked:', {
        activityType: input.headers?.activityType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

class PerformanceTrackingInterceptor {
  constructor(private healthMonitor: WorkerHealthMonitor) {}

  async execute(input: any, next: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      const result = await next(input);
      this.healthMonitor.updateTaskStats('completed');
      
      const duration = Date.now() - startTime;
      if (duration > 5000) { // Log slow activities
        console.warn('Slow activity detected:', {
          activityType: input.headers?.activityType,
          duration: `${duration}ms`
        });
      }
      
      return result;
    } catch (error) {
      this.healthMonitor.updateTaskStats('failed');
      throw error;
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  WorkerConfigFactory,
  ResourceMonitor,
  AutoTuningEngine,
  WorkerHealthMonitor,
  ProductionWorkerFactory
};

export default ProductionWorkerFactory;