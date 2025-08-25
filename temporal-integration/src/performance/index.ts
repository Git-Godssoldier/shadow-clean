/**
 * Advanced Performance Optimization and Monitoring for Temporal.io Integration
 * Implements adaptive performance tuning, caching, and optimization strategies
 */

import { Worker, WorkerOptions } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { MonitoringManager, MetricsCollector } from '../monitoring';
import { ConfigurationManager } from '../config';
import { 
  PerformanceConfig,
  OptimizationStrategy,
  CacheConfig,
  PerformanceMetrics,
  ThroughputOptimizer,
  LatencyOptimizer,
  ResourceOptimizer
} from '../types';

// ============================================================================
// Performance Cache Manager
// ============================================================================

export class PerformanceCacheManager {
  private static instance: PerformanceCacheManager;
  private caches = new Map<string, Map<string, any>>();
  private cacheStats = new Map<string, {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    maxSize: number;
    ttl: number;
  }>();
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): PerformanceCacheManager {
    if (!PerformanceCacheManager.instance) {
      PerformanceCacheManager.instance = new PerformanceCacheManager();
    }
    return PerformanceCacheManager.instance;
  }

  initializeCache(
    cacheName: string, 
    config: CacheConfig
  ): void {
    if (this.caches.has(cacheName)) {
      console.warn(`Cache ${cacheName} already exists, reinitializing`);
    }

    this.caches.set(cacheName, new Map());
    this.cacheStats.set(cacheName, {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: config.maxSize || 1000,
      ttl: config.ttlMs || 300000 // 5 minutes default
    });

    console.log(`Performance cache initialized: ${cacheName}`, config);
  }

  get<T>(cacheName: string, key: string): T | undefined {
    const cache = this.caches.get(cacheName);
    const stats = this.cacheStats.get(cacheName);
    
    if (!cache || !stats) {
      console.warn(`Cache ${cacheName} not found`);
      return undefined;
    }

    const entry = cache.get(key);
    if (entry && this.isEntryValid(entry)) {
      stats.hits++;
      return entry.value;
    } else {
      stats.misses++;
      if (entry) {
        // Entry expired
        cache.delete(key);
        stats.size--;
      }
      return undefined;
    }
  }

  set<T>(cacheName: string, key: string, value: T): void {
    const cache = this.caches.get(cacheName);
    const stats = this.cacheStats.get(cacheName);
    
    if (!cache || !stats) {
      console.warn(`Cache ${cacheName} not found`);
      return;
    }

    // Check if we need to evict
    if (cache.size >= stats.maxSize) {
      this.evictLeastRecentlyUsed(cacheName);
    }

    const entry = {
      value,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    };

    cache.set(key, entry);
    stats.size = cache.size;
  }

  invalidate(cacheName: string, key?: string): void {
    const cache = this.caches.get(cacheName);
    const stats = this.cacheStats.get(cacheName);
    
    if (!cache || !stats) return;

    if (key) {
      cache.delete(key);
    } else {
      cache.clear();
    }
    
    stats.size = cache.size;
  }

  private isEntryValid(entry: any): boolean {
    const stats = this.cacheStats.get('default');
    const ttl = stats?.ttl || 300000;
    return Date.now() - entry.timestamp < ttl;
  }

  private evictLeastRecentlyUsed(cacheName: string): void {
    const cache = this.caches.get(cacheName);
    const stats = this.cacheStats.get(cacheName);
    
    if (!cache || !stats) return;

    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
      stats.evictions++;
      stats.size = cache.size;
    }
  }

  getCacheStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, cacheStats] of this.cacheStats.entries()) {
      const total = cacheStats.hits + cacheStats.misses;
      stats[name] = {
        ...cacheStats,
        hitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
        utilizationRate: (cacheStats.size / cacheStats.maxSize) * 100
      };
    }
    
    return stats;
  }

  startCleanup(intervalMs = 60000): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, intervalMs);

    console.log('Cache cleanup started');
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    console.log('Cache cleanup stopped');
  }

  private cleanupExpiredEntries(): void {
    for (const [cacheName, cache] of this.caches.entries()) {
      const expiredKeys: string[] = [];
      
      for (const [key, entry] of cache.entries()) {
        if (!this.isEntryValid(entry)) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => cache.delete(key));
      
      if (expiredKeys.length > 0) {
        const stats = this.cacheStats.get(cacheName)!;
        stats.size = cache.size;
        console.debug(`Cleaned up ${expiredKeys.length} expired entries from cache ${cacheName}`);
      }
    }
  }
}

// ============================================================================
// Adaptive Performance Optimizer
// ============================================================================

export class AdaptivePerformanceOptimizer {
  private static instance: AdaptivePerformanceOptimizer;
  private optimizationStrategies: OptimizationStrategy[] = [];
  private currentStrategy?: OptimizationStrategy;
  private metricsCollector: MetricsCollector;
  private optimizationHistory: Array<{
    timestamp: Date;
    strategy: string;
    metrics: PerformanceMetrics;
    improvement: number;
  }> = [];
  private optimizing = false;

  private constructor() {
    this.metricsCollector = MetricsCollector.getInstance();
  }

  static getInstance(): AdaptivePerformanceOptimizer {
    if (!AdaptivePerformanceOptimizer.instance) {
      AdaptivePerformanceOptimizer.instance = new AdaptivePerformanceOptimizer();
    }
    return AdaptivePerformanceOptimizer.instance;
  }

  addOptimizationStrategy(strategy: OptimizationStrategy): void {
    this.optimizationStrategies.push(strategy);
    console.log(`Optimization strategy added: ${strategy.name}`);
  }

  startAdaptiveOptimization(intervalMs = 120000): void { // 2 minutes default
    if (this.optimizing) return;

    this.optimizing = true;
    
    setInterval(() => {
      this.performOptimizationCycle();
    }, intervalMs);

    console.log('Adaptive performance optimization started');
  }

  stopAdaptiveOptimization(): void {
    this.optimizing = false;
    console.log('Adaptive performance optimization stopped');
  }

  private async performOptimizationCycle(): Promise<void> {
    if (!this.optimizing || this.optimizationStrategies.length === 0) return;

    const currentMetrics = this.metricsCollector.getPerformanceMetrics();
    
    // Determine if optimization is needed
    if (!this.needsOptimization(currentMetrics)) {
      return;
    }

    // Select best strategy based on current conditions
    const strategy = this.selectOptimalStrategy(currentMetrics);
    
    if (!strategy) {
      console.warn('No suitable optimization strategy found');
      return;
    }

    console.log(`Applying optimization strategy: ${strategy.name}`);
    
    try {
      // Apply the optimization
      await strategy.apply(currentMetrics);
      
      // Wait for metrics to stabilize
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      
      // Measure improvement
      const newMetrics = this.metricsCollector.getPerformanceMetrics();
      const improvement = this.calculateImprovement(currentMetrics, newMetrics);
      
      // Record the optimization
      this.optimizationHistory.push({
        timestamp: new Date(),
        strategy: strategy.name,
        metrics: newMetrics,
        improvement
      });

      // Keep history manageable
      if (this.optimizationHistory.length > 100) {
        this.optimizationHistory.splice(0, 50);
      }

      this.currentStrategy = strategy;
      
      console.log(`Optimization completed: ${strategy.name}, improvement: ${improvement.toFixed(2)}%`);
      
    } catch (error) {
      console.error(`Optimization strategy failed: ${strategy.name}`, error);
    }
  }

  private needsOptimization(metrics: PerformanceMetrics): boolean {
    // Check various performance indicators
    const thresholds = {
      workflowFailureRate: 5,  // 5%
      activityFailureRate: 3,  // 3%
      systemLoad: 80,          // 80%
      memoryUtilization: 85,   // 85%
      throughput: 10           // minimum 10 operations/sec
    };

    return (
      metrics.workflowFailureRate > thresholds.workflowFailureRate ||
      metrics.activityFailureRate > thresholds.activityFailureRate ||
      metrics.systemLoad > thresholds.systemLoad ||
      metrics.memoryUtilization > thresholds.memoryUtilization ||
      metrics.throughput < thresholds.throughput
    );
  }

  private selectOptimalStrategy(metrics: PerformanceMetrics): OptimizationStrategy | undefined {
    // Score each strategy based on current conditions
    let bestStrategy: OptimizationStrategy | undefined;
    let bestScore = 0;

    for (const strategy of this.optimizationStrategies) {
      const score = this.scoreStrategy(strategy, metrics);
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  private scoreStrategy(strategy: OptimizationStrategy, metrics: PerformanceMetrics): number {
    let score = 0;

    // Base score from strategy priority
    score += strategy.priority || 1;

    // Adjust based on current conditions
    if (strategy.targetMetrics.includes('throughput') && metrics.throughput < 20) {
      score += 10;
    }

    if (strategy.targetMetrics.includes('latency') && metrics.averageWorkflowDuration > 10000) {
      score += 8;
    }

    if (strategy.targetMetrics.includes('memory') && metrics.memoryUtilization > 80) {
      score += 6;
    }

    if (strategy.targetMetrics.includes('cpu') && metrics.systemLoad > 75) {
      score += 6;
    }

    // Reduce score if recently applied (avoid oscillation)
    const recentApplications = this.optimizationHistory.filter(
      h => h.strategy === strategy.name && Date.now() - h.timestamp.getTime() < 600000 // 10 minutes
    );
    
    score -= recentApplications.length * 3;

    return Math.max(0, score);
  }

  private calculateImprovement(before: PerformanceMetrics, after: PerformanceMetrics): number {
    const metrics = [
      { before: before.throughput, after: after.throughput, weight: 0.3, higher: true },
      { before: before.workflowFailureRate, after: after.workflowFailureRate, weight: 0.2, higher: false },
      { before: before.activityFailureRate, after: after.activityFailureRate, weight: 0.2, higher: false },
      { before: before.systemLoad, after: after.systemLoad, weight: 0.15, higher: false },
      { before: before.memoryUtilization, after: after.memoryUtilization, weight: 0.15, higher: false }
    ];

    let totalImprovement = 0;
    let totalWeight = 0;

    for (const metric of metrics) {
      if (metric.before > 0) {
        const change = metric.higher ? 
          (metric.after - metric.before) / metric.before :
          (metric.before - metric.after) / metric.before;
        
        totalImprovement += change * metric.weight;
        totalWeight += metric.weight;
      }
    }

    return totalWeight > 0 ? (totalImprovement / totalWeight) * 100 : 0;
  }

  getOptimizationHistory(limit = 20): typeof this.optimizationHistory {
    return this.optimizationHistory.slice(-limit);
  }

  getCurrentStrategy(): OptimizationStrategy | undefined {
    return this.currentStrategy;
  }
}

// ============================================================================
// Throughput Optimizer
// ============================================================================

export class ThroughputOptimizer implements OptimizationStrategy {
  name = 'ThroughputOptimizer';
  priority = 5;
  targetMetrics = ['throughput', 'concurrency'];

  async apply(currentMetrics: PerformanceMetrics): Promise<void> {
    console.log('Applying throughput optimization');
    
    const configManager = ConfigurationManager.getInstance();
    const currentConfig = configManager.getWorkerConfig();

    // Increase concurrency if CPU usage is low
    if (currentMetrics.systemLoad < 60) {
      const newConcurrency = Math.floor(currentConfig.maxConcurrentActivityTaskExecutions! * 1.25);
      
      configManager.overrideConfig({
        worker: {
          maxConcurrentActivityTaskExecutions: Math.min(newConcurrency, 50),
          maxConcurrentWorkflowTaskExecutions: Math.floor(newConcurrency * 0.3)
        }
      });
      
      console.log(`Increased activity concurrency to ${newConcurrency}`);
    }

    // Optimize polling
    if (currentMetrics.throughput < 50) {
      configManager.overrideConfig({
        worker: {
          maxConcurrentActivityTaskPolls: Math.min(currentConfig.maxConcurrentActivityTaskPolls! + 1, 10),
          maxConcurrentWorkflowTaskPolls: Math.min(currentConfig.maxConcurrentWorkflowTaskPolls! + 1, 10)
        }
      });
      
      console.log('Increased polling concurrency');
    }

    // Enable aggressive caching
    const cacheManager = PerformanceCacheManager.getInstance();
    cacheManager.initializeCache('workflow-results', { maxSize: 2000, ttlMs: 600000 });
    cacheManager.initializeCache('activity-results', { maxSize: 5000, ttlMs: 300000 });
  }
}

// ============================================================================
// Latency Optimizer
// ============================================================================

export class LatencyOptimizer implements OptimizationStrategy {
  name = 'LatencyOptimizer';
  priority = 4;
  targetMetrics = ['latency', 'response-time'];

  async apply(currentMetrics: PerformanceMetrics): Promise<void> {
    console.log('Applying latency optimization');
    
    const configManager = ConfigurationManager.getInstance();
    
    // Reduce heartbeat intervals for faster responsiveness
    configManager.overrideConfig({
      worker: {
        defaultHeartbeatThrottleInterval: '1s',
        maxHeartbeatThrottleInterval: '5s'
      }
    });

    // Optimize sticky scheduling
    configManager.overrideConfig({
      worker: {
        stickyQueueScheduleToStartTimeout: '2s',
        maxCachedWorkflows: 1000
      }
    });

    // Enable result caching for frequently accessed data
    const cacheManager = PerformanceCacheManager.getInstance();
    cacheManager.initializeCache('fast-queries', { maxSize: 1000, ttlMs: 60000 }); // 1 minute cache
    
    console.log('Latency optimization applied');
  }
}

// ============================================================================
// Memory Optimizer
// ============================================================================

export class MemoryOptimizer implements OptimizationStrategy {
  name = 'MemoryOptimizer';
  priority = 6;
  targetMetrics = ['memory', 'heap'];

  async apply(currentMetrics: PerformanceMetrics): Promise<void> {
    console.log('Applying memory optimization');
    
    const configManager = ConfigurationManager.getInstance();
    
    // Reduce cached workflows if memory is high
    if (currentMetrics.memoryUtilization > 80) {
      configManager.overrideConfig({
        worker: {
          maxCachedWorkflows: 100,
          isolatePoolSize: Math.max(1, Math.floor(require('os').cpus().length / 2))
        }
      });
      
      console.log('Reduced workflow cache size');
    }

    // Force garbage collection if available
    if (global.gc && currentMetrics.memoryUtilization > 85) {
      global.gc();
      console.log('Forced garbage collection');
    }

    // Clear old cache entries
    const cacheManager = PerformanceCacheManager.getInstance();
    cacheManager.cleanupExpiredEntries();
    
    // Reduce cache sizes if memory pressure is high
    if (currentMetrics.memoryUtilization > 85) {
      cacheManager.initializeCache('workflow-results', { maxSize: 500, ttlMs: 180000 });
      cacheManager.initializeCache('activity-results', { maxSize: 1000, ttlMs: 120000 });
    }

    console.log('Memory optimization applied');
  }
}

// ============================================================================
// Connection Pool Optimizer
// ============================================================================

export class ConnectionPoolOptimizer implements OptimizationStrategy {
  name = 'ConnectionPoolOptimizer';
  priority = 3;
  targetMetrics = ['network', 'connection'];

  async apply(currentMetrics: PerformanceMetrics): Promise<void> {
    console.log('Applying connection pool optimization');
    
    const configManager = ConfigurationManager.getInstance();
    
    // Optimize RPC retry options based on current network performance
    if (currentMetrics.errorRate > 5) {
      configManager.overrideConfig({
        worker: {
          rpcRetryOptions: {
            initialInterval: '500ms',
            backoffCoefficient: 1.5,
            maximumInterval: '10s',
            maximumAttempts: 8
          }
        }
      });
      
      console.log('Optimized RPC retry settings for high error rate');
    }

    // Adjust polling based on throughput
    if (currentMetrics.throughput > 100) {
      configManager.overrideConfig({
        worker: {
          maxConcurrentActivityTaskPolls: 8,
          maxConcurrentWorkflowTaskPolls: 8
        }
      });
      
      console.log('Increased polling for high throughput');
    }
  }
}

// ============================================================================
// Performance Orchestrator
// ============================================================================

export class PerformanceOrchestrator {
  private static instance: PerformanceOrchestrator;
  private cacheManager: PerformanceCacheManager;
  private optimizer: AdaptivePerformanceOptimizer;
  private monitoringManager: MonitoringManager;
  private initialized = false;

  private constructor() {
    this.cacheManager = PerformanceCacheManager.getInstance();
    this.optimizer = AdaptivePerformanceOptimizer.getInstance();
    this.monitoringManager = MonitoringManager.getInstance();
  }

  static getInstance(): PerformanceOrchestrator {
    if (!PerformanceOrchestrator.instance) {
      PerformanceOrchestrator.instance = new PerformanceOrchestrator();
    }
    return PerformanceOrchestrator.instance;
  }

  initialize(config: PerformanceConfig): void {
    if (this.initialized) return;

    // Initialize caching
    if (config.enableCaching) {
      this.initializeCaches(config.cacheConfig);
      this.cacheManager.startCleanup();
    }

    // Initialize optimization strategies
    if (config.enableAdaptiveOptimization) {
      this.setupOptimizationStrategies();
      this.optimizer.startAdaptiveOptimization(config.optimizationIntervalMs);
    }

    this.initialized = true;
    console.log('Performance orchestrator initialized');
  }

  private initializeCaches(cacheConfig?: Record<string, CacheConfig>): void {
    const defaultCaches = {
      'workflow-results': { maxSize: 1000, ttlMs: 300000 },
      'activity-results': { maxSize: 2000, ttlMs: 180000 },
      'query-results': { maxSize: 500, ttlMs: 60000 },
      'configuration': { maxSize: 100, ttlMs: 1800000 } // 30 minutes
    };

    const configs = { ...defaultCaches, ...cacheConfig };
    
    for (const [name, config] of Object.entries(configs)) {
      this.cacheManager.initializeCache(name, config);
    }
  }

  private setupOptimizationStrategies(): void {
    this.optimizer.addOptimizationStrategy(new ThroughputOptimizer());
    this.optimizer.addOptimizationStrategy(new LatencyOptimizer());
    this.optimizer.addOptimizationStrategy(new MemoryOptimizer());
    this.optimizer.addOptimizationStrategy(new ConnectionPoolOptimizer());
  }

  getPerformanceReport(): {
    cacheStats: Record<string, any>;
    optimizationHistory: Array<any>;
    currentStrategy?: OptimizationStrategy;
    systemMetrics: PerformanceMetrics;
  } {
    return {
      cacheStats: this.cacheManager.getCacheStats(),
      optimizationHistory: this.optimizer.getOptimizationHistory(),
      currentStrategy: this.optimizer.getCurrentStrategy(),
      systemMetrics: this.monitoringManager.getPerformanceMetrics()
    };
  }

  shutdown(): void {
    if (!this.initialized) return;

    this.cacheManager.stopCleanup();
    this.optimizer.stopAdaptiveOptimization();
    this.initialized = false;
    
    console.log('Performance orchestrator shutdown complete');
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  PerformanceCacheManager,
  AdaptivePerformanceOptimizer,
  ThroughputOptimizer,
  LatencyOptimizer,
  MemoryOptimizer,
  ConnectionPoolOptimizer,
  PerformanceOrchestrator
};

export default PerformanceOrchestrator;