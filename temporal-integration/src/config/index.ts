/**
 * Configuration Management for Temporal.io Integration
 * Provides environment-specific configurations and presets
 */

import { 
  WorkerConfig, 
  ClientConfig, 
  AutoTuningConfig,
  ResourceLimits,
  ConnectionPoolConfig,
  WorkflowExecutionConfig
} from '../types';
import { RetryPolicies } from '../utils/error-handling';

// ============================================================================
// Environment Configuration
// ============================================================================

export interface EnvironmentConfig {
  worker: WorkerConfig;
  client: ClientConfig;
  autoTuning: AutoTuningConfig;
  resourceLimits: ResourceLimits;
  performance: {
    enableMetrics: boolean;
    metricsInterval: number;
    enableTracing: boolean;
    enableProfiling: boolean;
  };
}

// ============================================================================
// Development Configuration
// ============================================================================

export const developmentConfig: EnvironmentConfig = {
  worker: {
    taskQueue: 'dev-task-queue',
    namespace: 'default',
    workflowsPath: require.resolve('../workflows'),
    
    // Conservative settings for development
    maxConcurrentActivityTaskExecutions: 2,
    maxConcurrentWorkflowTaskExecutions: 1,
    maxConcurrentLocalActivityExecutions: 4,
    maxConcurrentActivityTaskPolls: 1,
    maxConcurrentWorkflowTaskPolls: 1,
    
    // Development-friendly timeouts
    maxActivitiesPerSecond: 10,
    maxTaskQueueActivitiesPerSecond: 5,
    stickyQueueScheduleToStartTimeout: '5s',
    
    // Enable debug features
    debugMode: true,
    enableLoggingInReplay: true,
    reuseV8Context: false,
    isolatePoolSize: 1,
    
    // Relaxed resource limits
    maxCachedWorkflows: 50,
    maxHeartbeatThrottleInterval: '10s',
    defaultHeartbeatThrottleInterval: '2s',
    
    // Connection settings
    rpcRetryOptions: {
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumInterval: '10s',
      maximumAttempts: 3
    },
    
    // Auto-tuning configuration
    autoTuning: {
      enabled: false, // Disabled in development
      adjustmentIntervalMs: 60000,
      highCpuThreshold: 90,
      lowCpuThreshold: 10,
      highMemoryThreshold: 90,
      highQueueLengthThreshold: 50
    }
  },
  
  client: {
    namespace: 'default',
    connectionPool: {
      maxConnections: 2,
      healthCheckIntervalMs: 60000,
      connectionTimeoutMs: 30000
    },
    
    interceptors: {
      workflow: []
    },
    
    connectionId: 'development'
  },
  
  autoTuning: {
    enabled: false,
    adjustmentIntervalMs: 60000,
    highCpuThreshold: 90,
    lowCpuThreshold: 10,
    highMemoryThreshold: 90,
    highQueueLengthThreshold: 50
  },
  
  resourceLimits: {
    maxMemoryUsageMB: 512,
    maxCpuUsagePercent: 80,
    maxConcurrentTasks: 10,
    maxQueueSize: 100
  },
  
  performance: {
    enableMetrics: true,
    metricsInterval: 30000,
    enableTracing: true,
    enableProfiling: false
  }
};

// ============================================================================
// Staging Configuration
// ============================================================================

export const stagingConfig: EnvironmentConfig = {
  worker: {
    taskQueue: 'staging-task-queue',
    namespace: 'staging',
    workflowsPath: require.resolve('../workflows'),
    
    // Moderate settings for staging
    maxConcurrentActivityTaskExecutions: 4,
    maxConcurrentWorkflowTaskExecutions: 2,
    maxConcurrentLocalActivityExecutions: 8,
    maxConcurrentActivityTaskPolls: 2,
    maxConcurrentWorkflowTaskPolls: 2,
    
    // Staging-appropriate timeouts
    maxActivitiesPerSecond: 50,
    maxTaskQueueActivitiesPerSecond: 25,
    stickyQueueScheduleToStartTimeout: '7s',
    
    // Production-like settings but more conservative
    debugMode: false,
    enableLoggingInReplay: false,
    reuseV8Context: true,
    isolatePoolSize: 2,
    
    // Moderate resource limits
    maxCachedWorkflows: 150,
    maxHeartbeatThrottleInterval: '20s',
    defaultHeartbeatThrottleInterval: '3s',
    
    // Improved connection settings
    rpcRetryOptions: {
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumInterval: '20s',
      maximumAttempts: 5
    },
    
    // Enable auto-tuning with conservative settings
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 45000,
      highCpuThreshold: 85,
      lowCpuThreshold: 15,
      highMemoryThreshold: 85,
      highQueueLengthThreshold: 75
    }
  },
  
  client: {
    namespace: 'staging',
    connectionPool: {
      maxConnections: 5,
      healthCheckIntervalMs: 45000,
      connectionTimeoutMs: 25000
    },
    
    interceptors: {
      workflow: []
    },
    
    connectionId: 'staging'
  },
  
  autoTuning: {
    enabled: true,
    adjustmentIntervalMs: 45000,
    highCpuThreshold: 85,
    lowCpuThreshold: 15,
    highMemoryThreshold: 85,
    highQueueLengthThreshold: 75
  },
  
  resourceLimits: {
    maxMemoryUsageMB: 1024,
    maxCpuUsagePercent: 85,
    maxConcurrentTasks: 50,
    maxQueueSize: 500
  },
  
  performance: {
    enableMetrics: true,
    metricsInterval: 20000,
    enableTracing: true,
    enableProfiling: true
  }
};

// ============================================================================
// Production Configuration
// ============================================================================

export const productionConfig: EnvironmentConfig = {
  worker: {
    taskQueue: 'production-task-queue',
    namespace: 'production',
    workflowsPath: require.resolve('../workflows'),
    
    // High-performance settings for production
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 5,
    maxConcurrentLocalActivityExecutions: 20,
    maxConcurrentActivityTaskPolls: 5,
    maxConcurrentWorkflowTaskPolls: 5,
    
    // Production-grade timeouts
    maxActivitiesPerSecond: 1000,
    maxTaskQueueActivitiesPerSecond: 500,
    stickyQueueScheduleToStartTimeout: '10s',
    
    // Optimized for production
    debugMode: false,
    enableLoggingInReplay: false,
    reuseV8Context: true,
    isolatePoolSize: Math.max(2, Math.ceil(require('os').cpus().length / 2)),
    
    // High resource limits
    maxCachedWorkflows: 500,
    maxHeartbeatThrottleInterval: '30s',
    defaultHeartbeatThrottleInterval: '5s',
    
    // Robust connection settings
    rpcRetryOptions: {
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumInterval: '30s',
      maximumAttempts: 10
    },
    
    // Aggressive auto-tuning for production
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 30000,
      highCpuThreshold: 80,
      lowCpuThreshold: 20,
      highMemoryThreshold: 85,
      highQueueLengthThreshold: 100
    }
  },
  
  client: {
    namespace: 'production',
    connectionPool: {
      maxConnections: 10,
      healthCheckIntervalMs: 30000,
      connectionTimeoutMs: 20000
    },
    
    interceptors: {
      workflow: []
    },
    
    connectionId: 'production'
  },
  
  autoTuning: {
    enabled: true,
    adjustmentIntervalMs: 30000,
    highCpuThreshold: 80,
    lowCpuThreshold: 20,
    highMemoryThreshold: 85,
    highQueueLengthThreshold: 100
  },
  
  resourceLimits: {
    maxMemoryUsageMB: 4096,
    maxCpuUsagePercent: 80,
    maxConcurrentTasks: 200,
    maxQueueSize: 2000
  },
  
  performance: {
    enableMetrics: true,
    metricsInterval: 10000,
    enableTracing: true,
    enableProfiling: true
  }
};

// ============================================================================
// Workload-Specific Configurations
// ============================================================================

export const workloadConfigs = {
  /**
   * Configuration optimized for CPU-intensive workloads
   */
  cpuIntensive: {
    maxConcurrentActivityTaskExecutions: Math.max(1, Math.floor(require('os').cpus().length * 0.8)),
    maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(require('os').cpus().length * 0.2)),
    maxConcurrentLocalActivityExecutions: require('os').cpus().length * 2,
    isolatePoolSize: Math.max(2, require('os').cpus().length),
    maxCachedWorkflows: 100,
    maxHeartbeatThrottleInterval: '30s',
    defaultHeartbeatThrottleInterval: '5s',
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 60000,
      highCpuThreshold: 90,
      lowCpuThreshold: 30,
      highMemoryThreshold: 80,
      highQueueLengthThreshold: 50
    }
  },

  /**
   * Configuration optimized for I/O-intensive workloads
   */
  ioIntensive: {
    maxConcurrentActivityTaskExecutions: require('os').cpus().length * 4,
    maxConcurrentWorkflowTaskExecutions: require('os').cpus().length,
    maxConcurrentLocalActivityExecutions: require('os').cpus().length * 8,
    isolatePoolSize: Math.min(10, Math.max(2, require('os').cpus().length)),
    maxCachedWorkflows: 500,
    maxHeartbeatThrottleInterval: '10s',
    defaultHeartbeatThrottleInterval: '2s',
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 30000,
      highCpuThreshold: 70,
      lowCpuThreshold: 10,
      highMemoryThreshold: 85,
      highQueueLengthThreshold: 200
    }
  },

  /**
   * Configuration optimized for memory-intensive workloads
   */
  memoryIntensive: {
    maxConcurrentActivityTaskExecutions: Math.max(1, Math.floor(require('os').totalmem() / (1024 * 1024 * 1024) / 2)),
    maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(require('os').cpus().length * 0.5)),
    maxConcurrentLocalActivityExecutions: Math.max(1, Math.floor(require('os').totalmem() / (1024 * 1024 * 1024))),
    isolatePoolSize: Math.max(1, Math.floor(require('os').totalmem() / (1024 * 1024 * 1024) / 4)),
    maxCachedWorkflows: Math.max(50, Math.floor(require('os').totalmem() / (1024 * 1024 * 1024) * 10)),
    maxHeartbeatThrottleInterval: '60s',
    defaultHeartbeatThrottleInterval: '10s',
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 45000,
      highCpuThreshold: 75,
      lowCpuThreshold: 15,
      highMemoryThreshold: 90,
      highQueueLengthThreshold: 75
    }
  },

  /**
   * Configuration for real-time/low-latency workloads
   */
  realTime: {
    maxConcurrentActivityTaskExecutions: require('os').cpus().length * 2,
    maxConcurrentWorkflowTaskExecutions: require('os').cpus().length,
    maxConcurrentLocalActivityExecutions: require('os').cpus().length * 4,
    isolatePoolSize: require('os').cpus().length,
    maxCachedWorkflows: 1000,
    maxHeartbeatThrottleInterval: '5s',
    defaultHeartbeatThrottleInterval: '1s',
    maxActivitiesPerSecond: 2000,
    maxTaskQueueActivitiesPerSecond: 1000,
    stickyQueueScheduleToStartTimeout: '2s',
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 15000,
      highCpuThreshold: 85,
      lowCpuThreshold: 25,
      highMemoryThreshold: 80,
      highQueueLengthThreshold: 50
    }
  },

  /**
   * Configuration for batch processing workloads
   */
  batchProcessing: {
    maxConcurrentActivityTaskExecutions: require('os').cpus().length * 3,
    maxConcurrentWorkflowTaskExecutions: Math.max(1, Math.floor(require('os').cpus().length * 0.5)),
    maxConcurrentLocalActivityExecutions: require('os').cpus().length * 6,
    isolatePoolSize: Math.max(2, Math.floor(require('os').cpus().length * 0.75)),
    maxCachedWorkflows: 200,
    maxHeartbeatThrottleInterval: '2m',
    defaultHeartbeatThrottleInterval: '30s',
    maxActivitiesPerSecond: 500,
    maxTaskQueueActivitiesPerSecond: 250,
    stickyQueueScheduleToStartTimeout: '30s',
    autoTuning: {
      enabled: true,
      adjustmentIntervalMs: 120000,
      highCpuThreshold: 85,
      lowCpuThreshold: 20,
      highMemoryThreshold: 85,
      highQueueLengthThreshold: 500
    }
  }
};

// ============================================================================
// Configuration Manager
// ============================================================================

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private currentConfig: EnvironmentConfig;
  private environment: string;

  private constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.currentConfig = this.loadEnvironmentConfig();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadEnvironmentConfig(): EnvironmentConfig {
    switch (this.environment) {
      case 'production':
        return { ...productionConfig };
      case 'staging':
        return { ...stagingConfig };
      case 'development':
      default:
        return { ...developmentConfig };
    }
  }

  getConfig(): EnvironmentConfig {
    return { ...this.currentConfig };
  }

  getWorkerConfig(): WorkerConfig {
    return { ...this.currentConfig.worker };
  }

  getClientConfig(): ClientConfig {
    return { ...this.currentConfig.client };
  }

  applyWorkloadOptimization(workloadType: keyof typeof workloadConfigs): void {
    const workloadConfig = workloadConfigs[workloadType];
    this.currentConfig.worker = {
      ...this.currentConfig.worker,
      ...workloadConfig
    };
    
    console.log(`Applied ${workloadType} workload optimization`);
  }

  overrideConfig(overrides: Partial<EnvironmentConfig>): void {
    this.currentConfig = {
      ...this.currentConfig,
      ...overrides,
      worker: {
        ...this.currentConfig.worker,
        ...overrides.worker
      },
      client: {
        ...this.currentConfig.client,
        ...overrides.client
      }
    };
    
    console.log('Configuration overrides applied');
  }

  getEnvironment(): string {
    return this.environment;
  }

  isProduction(): boolean {
    return this.environment === 'production';
  }

  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  validateConfig(): boolean {
    try {
      const config = this.currentConfig;
      
      // Validate worker configuration
      if (!config.worker.taskQueue) {
        throw new Error('Worker task queue is required');
      }
      
      if (config.worker.maxConcurrentActivityTaskExecutions <= 0) {
        throw new Error('maxConcurrentActivityTaskExecutions must be positive');
      }
      
      // Validate client configuration
      if (!config.client.namespace) {
        throw new Error('Client namespace is required');
      }
      
      // Validate resource limits
      if (config.resourceLimits.maxMemoryUsageMB <= 0) {
        throw new Error('maxMemoryUsageMB must be positive');
      }
      
      console.log('Configuration validation passed');
      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }

  exportConfig(): string {
    return JSON.stringify(this.currentConfig, null, 2);
  }

  loadFromFile(configPath: string): void {
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(configPath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      
      this.overrideConfig(loadedConfig);
      console.log(`Configuration loaded from: ${configPath}`);
    } catch (error) {
      console.error(`Failed to load configuration from ${configPath}:`, error);
      throw error;
    }
  }

  saveToFile(configPath: string): void {
    try {
      const fs = require('fs');
      fs.writeFileSync(configPath, this.exportConfig(), 'utf8');
      console.log(`Configuration saved to: ${configPath}`);
    } catch (error) {
      console.error(`Failed to save configuration to ${configPath}:`, error);
      throw error;
    }
  }
}

// ============================================================================
// Default Workflow Execution Configurations
// ============================================================================

export const workflowExecutionConfigs: Record<string, WorkflowExecutionConfig> = {
  /**
   * Configuration for short-running tasks
   */
  shortRunning: {
    defaultExecutionTimeout: '5m',
    defaultRunTimeout: '3m',
    defaultTaskTimeout: '30s',
    retryPolicy: RetryPolicies.FAST
  },

  /**
   * Configuration for long-running tasks
   */
  longRunning: {
    defaultExecutionTimeout: '24h',
    defaultRunTimeout: '12h',
    defaultTaskTimeout: '1m',
    retryPolicy: RetryPolicies.AGGRESSIVE
  },

  /**
   * Configuration for critical tasks
   */
  critical: {
    defaultExecutionTimeout: '2h',
    defaultRunTimeout: '1h',
    defaultTaskTimeout: '30s',
    retryPolicy: RetryPolicies.CRITICAL
  },

  /**
   * Configuration for batch processing
   */
  batch: {
    defaultExecutionTimeout: '12h',
    defaultRunTimeout: '6h',
    defaultTaskTimeout: '5m',
    retryPolicy: RetryPolicies.STANDARD
  }
};

// ============================================================================
// Exports
// ============================================================================

export {
  developmentConfig,
  stagingConfig,
  productionConfig,
  workloadConfigs,
  workflowExecutionConfigs,
  ConfigurationManager
};

export default ConfigurationManager;