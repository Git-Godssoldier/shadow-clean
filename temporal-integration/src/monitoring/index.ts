/**
 * Comprehensive Monitoring and Metrics System for Temporal.io Integration
 * Implements performance tracking, alerting, and observability features
 */

import { WorkflowHandle } from '@temporalio/client';
import { 
  MonitoringConfig,
  MetricsData,
  AlertRule,
  AlertEvent,
  PerformanceMetrics,
  SystemHealth
} from '../types';

// ============================================================================
// Metrics Collector
// ============================================================================

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: MetricsData = {
    workflows: {
      started: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    },
    activities: {
      started: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    },
    workers: {
      active: 0,
      taskQueueLength: 0,
      pollerCount: 0,
      taskThroughput: 0,
      errorRate: 0
    },
    system: {
      cpuUsage: 0,
      memoryUsage: 0,
      heapUsage: 0,
      uptime: 0,
      lastUpdated: new Date()
    }
  };

  private executionTimes: number[] = [];
  private activityTimes: number[] = [];
  private startTime = Date.now();
  private collecting = false;
  private collectionInterval?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  startCollection(intervalMs = 10000): void {
    if (this.collecting) return;

    this.collecting = true;
    this.collectionInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, intervalMs);

    console.log('Metrics collection started');
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
    this.collecting = false;
    console.log('Metrics collection stopped');
  }

  // Workflow metrics
  recordWorkflowStart(): void {
    this.metrics.workflows.started++;
    this.metrics.workflows.running++;
  }

  recordWorkflowCompletion(executionTimeMs: number): void {
    this.metrics.workflows.completed++;
    this.metrics.workflows.running = Math.max(0, this.metrics.workflows.running - 1);
    
    this.executionTimes.push(executionTimeMs);
    this.updateWorkflowAverages();
  }

  recordWorkflowFailure(): void {
    this.metrics.workflows.failed++;
    this.metrics.workflows.running = Math.max(0, this.metrics.workflows.running - 1);
  }

  recordWorkflowCancellation(): void {
    this.metrics.workflows.cancelled++;
    this.metrics.workflows.running = Math.max(0, this.metrics.workflows.running - 1);
  }

  // Activity metrics
  recordActivityStart(): void {
    this.metrics.activities.started++;
  }

  recordActivityCompletion(executionTimeMs: number): void {
    this.metrics.activities.completed++;
    
    this.activityTimes.push(executionTimeMs);
    this.updateActivityAverages();
  }

  recordActivityFailure(): void {
    this.metrics.activities.failed++;
  }

  recordActivityRetry(): void {
    this.metrics.activities.retried++;
  }

  // Worker metrics
  updateWorkerMetrics(data: {
    activeWorkers?: number;
    taskQueueLength?: number;
    pollerCount?: number;
    taskThroughput?: number;
    errorRate?: number;
  }): void {
    if (data.activeWorkers !== undefined) this.metrics.workers.active = data.activeWorkers;
    if (data.taskQueueLength !== undefined) this.metrics.workers.taskQueueLength = data.taskQueueLength;
    if (data.pollerCount !== undefined) this.metrics.workers.pollerCount = data.pollerCount;
    if (data.taskThroughput !== undefined) this.metrics.workers.taskThroughput = data.taskThroughput;
    if (data.errorRate !== undefined) this.metrics.workers.errorRate = data.errorRate;
  }

  private updateWorkflowAverages(): void {
    if (this.executionTimes.length > 0) {
      this.metrics.workflows.totalExecutionTime = this.executionTimes.reduce((a, b) => a + b, 0);
      this.metrics.workflows.averageExecutionTime = 
        this.metrics.workflows.totalExecutionTime / this.executionTimes.length;
    }

    // Keep only recent execution times to avoid memory issues
    if (this.executionTimes.length > 1000) {
      this.executionTimes = this.executionTimes.slice(-500);
    }
  }

  private updateActivityAverages(): void {
    if (this.activityTimes.length > 0) {
      this.metrics.activities.totalExecutionTime = this.activityTimes.reduce((a, b) => a + b, 0);
      this.metrics.activities.averageExecutionTime = 
        this.metrics.activities.totalExecutionTime / this.activityTimes.length;
    }

    // Keep only recent activity times to avoid memory issues
    if (this.activityTimes.length > 1000) {
      this.activityTimes = this.activityTimes.slice(-500);
    }
  }

  private updateSystemMetrics(): void {
    const process = require('process');
    const os = require('os');

    const memUsage = process.memoryUsage();
    const totalMemory = os.totalmem();

    this.metrics.system = {
      cpuUsage: this.getCPUUsage(),
      memoryUsage: (memUsage.rss / totalMemory) * 100,
      heapUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      uptime: Date.now() - this.startTime,
      lastUpdated: new Date()
    };
  }

  private getCPUUsage(): number {
    // Simplified CPU usage calculation
    // In a real implementation, this would use a proper CPU monitoring library
    const loadAvg = require('os').loadavg()[0];
    const cpuCount = require('os').cpus().length;
    return Math.min(100, (loadAvg / cpuCount) * 100);
  }

  getMetrics(): MetricsData {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const totalWorkflows = this.metrics.workflows.started;
    const successfulWorkflows = this.metrics.workflows.completed;
    const failedWorkflows = this.metrics.workflows.failed;

    const totalActivities = this.metrics.activities.started;
    const successfulActivities = this.metrics.activities.completed;
    const failedActivities = this.metrics.activities.failed;

    return {
      workflowSuccessRate: totalWorkflows > 0 ? (successfulWorkflows / totalWorkflows) * 100 : 100,
      workflowFailureRate: totalWorkflows > 0 ? (failedWorkflows / totalWorkflows) * 100 : 0,
      activitySuccessRate: totalActivities > 0 ? (successfulActivities / totalActivities) * 100 : 100,
      activityFailureRate: totalActivities > 0 ? (failedActivities / totalActivities) * 100 : 0,
      averageWorkflowDuration: this.metrics.workflows.averageExecutionTime,
      averageActivityDuration: this.metrics.activities.averageExecutionTime,
      throughput: this.metrics.workers.taskThroughput,
      errorRate: this.metrics.workers.errorRate,
      systemLoad: this.metrics.system.cpuUsage,
      memoryUtilization: this.metrics.system.memoryUsage
    };
  }

  reset(): void {
    this.metrics = {
      workflows: {
        started: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        running: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0
      },
      activities: {
        started: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0
      },
      workers: {
        active: 0,
        taskQueueLength: 0,
        pollerCount: 0,
        taskThroughput: 0,
        errorRate: 0
      },
      system: {
        cpuUsage: 0,
        memoryUsage: 0,
        heapUsage: 0,
        uptime: 0,
        lastUpdated: new Date()
      }
    };
    
    this.executionTimes = [];
    this.activityTimes = [];
    this.startTime = Date.now();
  }
}

// ============================================================================
// Alert Manager
// ============================================================================

export class AlertManager {
  private static instance: AlertManager;
  private alertRules: AlertRule[] = [];
  private activeAlerts = new Map<string, AlertEvent>();
  private alertHistory: AlertEvent[] = [];
  private checking = false;
  private checkInterval?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  addRule(rule: AlertRule): void {
    this.alertRules.push({
      ...rule,
      id: rule.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
    console.log(`Alert rule added: ${rule.name}`);
  }

  removeRule(ruleId: string): void {
    this.alertRules = this.alertRules.filter(rule => rule.id !== ruleId);
    console.log(`Alert rule removed: ${ruleId}`);
  }

  startChecking(intervalMs = 30000): void {
    if (this.checking) return;

    this.checking = true;
    this.checkInterval = setInterval(() => {
      this.checkRules();
    }, intervalMs);

    console.log('Alert checking started');
  }

  stopChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.checking = false;
    console.log('Alert checking stopped');
  }

  private checkRules(): void {
    const metrics = MetricsCollector.getInstance().getMetrics();
    const performance = MetricsCollector.getInstance().getPerformanceMetrics();

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      const isTriggered = this.evaluateRule(rule, metrics, performance);
      const alertId = `${rule.id}-${rule.metric}`;

      if (isTriggered && !this.activeAlerts.has(alertId)) {
        // New alert triggered
        const alert: AlertEvent = {
          id: alertId,
          ruleId: rule.id!,
          ruleName: rule.name,
          severity: rule.severity,
          message: this.generateAlertMessage(rule, metrics, performance),
          triggeredAt: new Date(),
          metric: rule.metric,
          threshold: rule.threshold,
          currentValue: this.getMetricValue(rule.metric, metrics, performance)
        };

        this.activeAlerts.set(alertId, alert);
        this.alertHistory.push(alert);
        this.handleAlert(alert);
      } else if (!isTriggered && this.activeAlerts.has(alertId)) {
        // Alert resolved
        const alert = this.activeAlerts.get(alertId)!;
        alert.resolvedAt = new Date();
        this.activeAlerts.delete(alertId);
        this.handleAlertResolution(alert);
      }
    }

    // Clean up old alert history
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-500);
    }
  }

  private evaluateRule(
    rule: AlertRule, 
    metrics: MetricsData, 
    performance: PerformanceMetrics
  ): boolean {
    const currentValue = this.getMetricValue(rule.metric, metrics, performance);
    
    switch (rule.operator) {
      case 'greater_than':
        return currentValue > rule.threshold;
      case 'less_than':
        return currentValue < rule.threshold;
      case 'equal':
        return currentValue === rule.threshold;
      case 'not_equal':
        return currentValue !== rule.threshold;
      default:
        return false;
    }
  }

  private getMetricValue(
    metric: string, 
    metrics: MetricsData, 
    performance: PerformanceMetrics
  ): number {
    switch (metric) {
      case 'workflow_failure_rate':
        return performance.workflowFailureRate;
      case 'activity_failure_rate':
        return performance.activityFailureRate;
      case 'cpu_usage':
        return metrics.system.cpuUsage;
      case 'memory_usage':
        return metrics.system.memoryUsage;
      case 'heap_usage':
        return metrics.system.heapUsage;
      case 'task_queue_length':
        return metrics.workers.taskQueueLength;
      case 'error_rate':
        return metrics.workers.errorRate;
      case 'throughput':
        return metrics.workers.taskThroughput;
      case 'average_workflow_duration':
        return metrics.workflows.averageExecutionTime;
      case 'average_activity_duration':
        return metrics.activities.averageExecutionTime;
      case 'running_workflows':
        return metrics.workflows.running;
      default:
        return 0;
    }
  }

  private generateAlertMessage(
    rule: AlertRule, 
    metrics: MetricsData, 
    performance: PerformanceMetrics
  ): string {
    const currentValue = this.getMetricValue(rule.metric, metrics, performance);
    return `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`;
  }

  private handleAlert(alert: AlertEvent): void {
    console.warn(`🚨 ALERT: ${alert.message}`, {
      severity: alert.severity,
      ruleId: alert.ruleId,
      triggeredAt: alert.triggeredAt
    });

    // In a real implementation, this would send notifications
    // via email, Slack, PagerDuty, etc.
    if (alert.severity === 'critical') {
      this.sendCriticalAlert(alert);
    }
  }

  private handleAlertResolution(alert: AlertEvent): void {
    console.info(`✅ RESOLVED: ${alert.message}`, {
      resolvedAt: alert.resolvedAt,
      duration: alert.resolvedAt!.getTime() - alert.triggeredAt.getTime()
    });
  }

  private sendCriticalAlert(alert: AlertEvent): void {
    // Implementation would integrate with alerting systems
    console.error(`CRITICAL ALERT: ${alert.message}`);
    
    // Example: Send to webhook, email, or messaging service
    // this.sendToWebhook(alert);
    // this.sendEmail(alert);
    // this.sendSlackMessage(alert);
  }

  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit = 50): AlertEvent[] {
    return this.alertHistory.slice(-limit);
  }

  getAlertRules(): AlertRule[] {
    return [...this.alertRules];
  }
}

// ============================================================================
// Health Monitor
// ============================================================================

export class HealthMonitor {
  private static instance: HealthMonitor;
  private healthChecks: Array<{
    name: string;
    check: () => Promise<boolean>;
    lastResult: boolean;
    lastRun: Date;
    errorCount: number;
  }> = [];

  private constructor() {}

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  addHealthCheck(
    name: string, 
    check: () => Promise<boolean>
  ): void {
    this.healthChecks.push({
      name,
      check,
      lastResult: true,
      lastRun: new Date(),
      errorCount: 0
    });
    console.log(`Health check added: ${name}`);
  }

  async runHealthChecks(): Promise<SystemHealth> {
    const results: Record<string, boolean> = {};
    let overallHealth = true;
    let healthyChecks = 0;
    let totalChecks = this.healthChecks.length;

    for (const healthCheck of this.healthChecks) {
      try {
        const result = await healthCheck.check();
        healthCheck.lastResult = result;
        healthCheck.lastRun = new Date();
        healthCheck.errorCount = result ? 0 : healthCheck.errorCount + 1;
        
        results[healthCheck.name] = result;
        if (result) {
          healthyChecks++;
        } else {
          overallHealth = false;
        }
      } catch (error) {
        healthCheck.lastResult = false;
        healthCheck.lastRun = new Date();
        healthCheck.errorCount++;
        results[healthCheck.name] = false;
        overallHealth = false;
        
        console.error(`Health check failed: ${healthCheck.name}`, error);
      }
    }

    const metrics = MetricsCollector.getInstance().getMetrics();
    const performance = MetricsCollector.getInstance().getPerformanceMetrics();

    return {
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      checks: results,
      metrics: {
        totalChecks,
        healthyChecks,
        failedChecks: totalChecks - healthyChecks,
        successRate: totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 100
      },
      systemMetrics: metrics,
      performance,
      uptime: metrics.system.uptime
    };
  }

  async performHealthCheck(): Promise<boolean> {
    const health = await this.runHealthChecks();
    
    console.log(`Health check completed: ${health.status}`, {
      successRate: `${health.metrics.successRate.toFixed(1)}%`,
      failedChecks: health.metrics.failedChecks,
      uptime: `${Math.floor(health.uptime / 1000)}s`
    });

    return health.status === 'healthy';
  }

  getHealthCheckStatus(): Array<{
    name: string;
    lastResult: boolean;
    lastRun: Date;
    errorCount: number;
  }> {
    return this.healthChecks.map(check => ({
      name: check.name,
      lastResult: check.lastResult,
      lastRun: check.lastRun,
      errorCount: check.errorCount
    }));
  }
}

// ============================================================================
// Performance Tracker
// ============================================================================

export class PerformanceTracker {
  private operationTimes = new Map<string, number[]>();
  private activeOperations = new Map<string, number>();

  startOperation(operationId: string): void {
    this.activeOperations.set(operationId, Date.now());
  }

  endOperation(operationId: string): number {
    const startTime = this.activeOperations.get(operationId);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operationId}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.activeOperations.delete(operationId);

    // Store operation time
    const operationType = operationId.split('-')[0]; // Extract operation type
    if (!this.operationTimes.has(operationType)) {
      this.operationTimes.set(operationType, []);
    }
    
    const times = this.operationTimes.get(operationType)!;
    times.push(duration);
    
    // Keep only recent times
    if (times.length > 1000) {
      this.operationTimes.set(operationType, times.slice(-500));
    }

    return duration;
  }

  getOperationStats(operationType: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
  } {
    const times = this.operationTimes.get(operationType) || [];
    
    if (times.length === 0) {
      return { count: 0, average: 0, min: 0, max: 0, p95: 0 };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const count = times.length;
    const sum = times.reduce((a, b) => a + b, 0);
    
    return {
      count,
      average: sum / count,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(count * 0.95)]
    };
  }

  getAllStats(): Record<string, ReturnType<typeof this.getOperationStats>> {
    const stats: Record<string, ReturnType<typeof this.getOperationStats>> = {};
    
    for (const operationType of this.operationTimes.keys()) {
      stats[operationType] = this.getOperationStats(operationType);
    }
    
    return stats;
  }
}

// ============================================================================
// Monitoring Manager
// ============================================================================

export class MonitoringManager {
  private static instance: MonitoringManager;
  private config: MonitoringConfig;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private healthMonitor: HealthMonitor;
  private performanceTracker: PerformanceTracker;
  private initialized = false;

  private constructor(config: MonitoringConfig) {
    this.config = config;
    this.metricsCollector = MetricsCollector.getInstance();
    this.alertManager = AlertManager.getInstance();
    this.healthMonitor = HealthMonitor.getInstance();
    this.performanceTracker = new PerformanceTracker();
  }

  static initialize(config: MonitoringConfig): MonitoringManager {
    if (!MonitoringManager.instance) {
      MonitoringManager.instance = new MonitoringManager(config);
    }
    return MonitoringManager.instance;
  }

  static getInstance(): MonitoringManager {
    if (!MonitoringManager.instance) {
      throw new Error('MonitoringManager must be initialized first');
    }
    return MonitoringManager.instance;
  }

  start(): void {
    if (this.initialized) return;

    // Start metrics collection
    if (this.config.enableMetrics) {
      this.metricsCollector.startCollection(this.config.metricsIntervalMs);
    }

    // Start alert checking
    if (this.config.enableAlerts) {
      this.alertManager.startChecking(this.config.alertCheckIntervalMs);
      this.setupDefaultAlerts();
    }

    // Setup default health checks
    if (this.config.enableHealthChecks) {
      this.setupDefaultHealthChecks();
    }

    this.initialized = true;
    console.log('Monitoring manager started');
  }

  stop(): void {
    this.metricsCollector.stopCollection();
    this.alertManager.stopChecking();
    this.initialized = false;
    console.log('Monitoring manager stopped');
  }

  private setupDefaultAlerts(): void {
    const defaultRules: Omit<AlertRule, 'id'>[] = [
      {
        name: 'High CPU Usage',
        metric: 'cpu_usage',
        operator: 'greater_than',
        threshold: 90,
        severity: 'critical',
        enabled: true
      },
      {
        name: 'High Memory Usage',
        metric: 'memory_usage',
        operator: 'greater_than',
        threshold: 85,
        severity: 'warning',
        enabled: true
      },
      {
        name: 'High Workflow Failure Rate',
        metric: 'workflow_failure_rate',
        operator: 'greater_than',
        threshold: 10,
        severity: 'critical',
        enabled: true
      },
      {
        name: 'High Task Queue Length',
        metric: 'task_queue_length',
        operator: 'greater_than',
        threshold: 100,
        severity: 'warning',
        enabled: true
      },
      {
        name: 'Low Throughput',
        metric: 'throughput',
        operator: 'less_than',
        threshold: 10,
        severity: 'warning',
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      this.alertManager.addRule(rule as AlertRule);
    }
  }

  private setupDefaultHealthChecks(): void {
    // System memory health check
    this.healthMonitor.addHealthCheck('memory', async () => {
      const metrics = this.metricsCollector.getMetrics();
      return metrics.system.memoryUsage < 90;
    });

    // System CPU health check
    this.healthMonitor.addHealthCheck('cpu', async () => {
      const metrics = this.metricsCollector.getMetrics();
      return metrics.system.cpuUsage < 95;
    });

    // Workflow success rate health check
    this.healthMonitor.addHealthCheck('workflow_success', async () => {
      const performance = this.metricsCollector.getPerformanceMetrics();
      return performance.workflowFailureRate < 20;
    });
  }

  getMetrics() {
    return this.metricsCollector.getMetrics();
  }

  getPerformanceMetrics() {
    return this.metricsCollector.getPerformanceMetrics();
  }

  getActiveAlerts() {
    return this.alertManager.getActiveAlerts();
  }

  async getSystemHealth() {
    return await this.healthMonitor.runHealthChecks();
  }

  getPerformanceStats() {
    return this.performanceTracker.getAllStats();
  }

  trackOperation(operationId: string) {
    this.performanceTracker.startOperation(operationId);
    return () => this.performanceTracker.endOperation(operationId);
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  MetricsCollector,
  AlertManager,
  HealthMonitor,
  PerformanceTracker,
  MonitoringManager
};

export default MonitoringManager;