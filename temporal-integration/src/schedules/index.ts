/**
 * Comprehensive Schedules and Timers Implementation for Temporal.io Integration
 * Provides cron-based scheduling, timer management, and advanced scheduling patterns
 */

import { 
  Client, 
  ScheduleHandle,
  ScheduleOptions,
  SchedulePolicy,
  ScheduleSpec,
  ScheduleState,
  ScheduleDescription
} from '@temporalio/client';

import { TemporalClient } from '../clients';
import { 
  ScheduleConfig,
  TimerConfig,
  ScheduleEvent,
  RecurrencePattern,
  DynamicSchedule,
  ScheduleMetrics,
  TimerMetrics,
  AdvancedScheduleOptions
} from '../types';

// ============================================================================
// Schedule Manager
// ============================================================================

export class ScheduleManager {
  private static instance: ScheduleManager;
  private client: Client;
  private activeSchedules = new Map<string, ScheduleHandle>();
  private scheduleMetrics = new Map<string, ScheduleMetrics>();
  private monitoring = false;

  private constructor(client: Client) {
    this.client = client;
  }

  static async create(client: Client): Promise<ScheduleManager> {
    if (!ScheduleManager.instance) {
      ScheduleManager.instance = new ScheduleManager(client);
    }
    return ScheduleManager.instance;
  }

  static getInstance(): ScheduleManager {
    if (!ScheduleManager.instance) {
      throw new Error('ScheduleManager must be created first');
    }
    return ScheduleManager.instance;
  }

  // ========================================================================
  // Schedule Creation and Management
  // ========================================================================

  async createSchedule(
    scheduleId: string,
    config: ScheduleConfig,
    options?: AdvancedScheduleOptions
  ): Promise<ScheduleHandle> {
    console.log(`Creating schedule: ${scheduleId}`, config);

    const scheduleSpec = this.buildScheduleSpec(config);
    const schedulePolicy = this.buildSchedulePolicy(config, options);

    const scheduleOptions: ScheduleOptions = {
      scheduleId,
      spec: scheduleSpec,
      action: {
        type: 'startWorkflow',
        workflowType: config.workflowType,
        args: config.workflowArgs || [],
        taskQueue: config.taskQueue,
        workflowExecutionTimeout: config.workflowExecutionTimeout,
        workflowRunTimeout: config.workflowRunTimeout,
        workflowTaskTimeout: config.workflowTaskTimeout,
        retry: config.retryPolicy,
        memo: config.memo,
        searchAttributes: config.searchAttributes
      },
      policy: schedulePolicy,
      state: {
        note: config.description || `Schedule for ${config.workflowType}`,
        paused: config.paused || false
      }
    };

    try {
      const handle = await this.client.schedule.create(scheduleOptions);
      
      // Store handle and initialize metrics
      this.activeSchedules.set(scheduleId, handle);
      this.initializeScheduleMetrics(scheduleId, config);
      
      // Set up monitoring if enabled
      if (options?.enableMonitoring !== false) {
        this.setupScheduleMonitoring(scheduleId, handle);
      }

      console.log(`Schedule created successfully: ${scheduleId}`);
      return handle;

    } catch (error) {
      console.error(`Failed to create schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  async updateSchedule(
    scheduleId: string,
    updates: Partial<ScheduleConfig>,
    options?: AdvancedScheduleOptions
  ): Promise<void> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Updating schedule: ${scheduleId}`, updates);

    try {
      await handle.update((schedule) => {
        if (updates.cronExpression || updates.intervals || updates.calendars) {
          schedule.spec = this.buildScheduleSpec(updates as ScheduleConfig);
        }

        if (updates.overlap || updates.catchupWindow || updates.pauseOnFailure) {
          schedule.policy = this.buildSchedulePolicy(updates as ScheduleConfig, options);
        }

        if (updates.description !== undefined) {
          schedule.state.note = updates.description;
        }

        if (updates.paused !== undefined) {
          schedule.state.paused = updates.paused;
        }

        return schedule;
      });

      console.log(`Schedule updated successfully: ${scheduleId}`);

    } catch (error) {
      console.error(`Failed to update schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  async pauseSchedule(scheduleId: string): Promise<void> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Pausing schedule: ${scheduleId}`);

    try {
      await handle.pause('Paused via ScheduleManager');
      this.updateScheduleMetrics(scheduleId, { state: 'paused' });
      console.log(`Schedule paused: ${scheduleId}`);
    } catch (error) {
      console.error(`Failed to pause schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Resuming schedule: ${scheduleId}`);

    try {
      await handle.unpause('Resumed via ScheduleManager');
      this.updateScheduleMetrics(scheduleId, { state: 'active' });
      console.log(`Schedule resumed: ${scheduleId}`);
    } catch (error) {
      console.error(`Failed to resume schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Deleting schedule: ${scheduleId}`);

    try {
      await handle.delete();
      this.activeSchedules.delete(scheduleId);
      this.scheduleMetrics.delete(scheduleId);
      console.log(`Schedule deleted: ${scheduleId}`);
    } catch (error) {
      console.error(`Failed to delete schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  async triggerSchedule(scheduleId: string, overlap = false): Promise<void> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`Triggering schedule: ${scheduleId}`);

    try {
      await handle.trigger(overlap);
      this.updateScheduleMetrics(scheduleId, { 
        manualTriggers: (this.scheduleMetrics.get(scheduleId)?.manualTriggers || 0) + 1 
      });
      console.log(`Schedule triggered: ${scheduleId}`);
    } catch (error) {
      console.error(`Failed to trigger schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  // ========================================================================
  // Schedule Querying and Information
  // ========================================================================

  async getScheduleInfo(scheduleId: string): Promise<ScheduleDescription> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    try {
      return await handle.describe();
    } catch (error) {
      console.error(`Failed to get schedule info ${scheduleId}:`, error);
      throw error;
    }
  }

  async listSchedules(pageSize = 100): Promise<string[]> {
    try {
      const schedules: string[] = [];
      
      for await (const schedule of this.client.schedule.list({
        pageSize
      })) {
        schedules.push(schedule.scheduleId);
      }
      
      return schedules;
    } catch (error) {
      console.error('Failed to list schedules:', error);
      throw error;
    }
  }

  async getScheduleHistory(
    scheduleId: string, 
    limit = 100
  ): Promise<ScheduleEvent[]> {
    const handle = this.activeSchedules.get(scheduleId);
    if (!handle) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    try {
      const events: ScheduleEvent[] = [];
      
      for await (const event of handle.listRecentActions({ limit })) {
        events.push({
          timestamp: event.scheduledAt,
          action: event.action,
          result: event.result,
          workflowId: event.workflowId,
          runId: event.runId
        });
      }
      
      return events;
    } catch (error) {
      console.error(`Failed to get schedule history ${scheduleId}:`, error);
      throw error;
    }
  }

  // ========================================================================
  // Advanced Scheduling Patterns
  // ========================================================================

  async createRecurringSchedule(
    scheduleId: string,
    pattern: RecurrencePattern,
    workflowConfig: {
      workflowType: string;
      taskQueue: string;
      args?: any[];
    },
    options?: AdvancedScheduleOptions
  ): Promise<ScheduleHandle> {
    const config = this.buildRecurringScheduleConfig(pattern, workflowConfig);
    return await this.createSchedule(scheduleId, config, options);
  }

  async createConditionalSchedule(
    scheduleId: string,
    baseConfig: ScheduleConfig,
    condition: {
      predicate: () => Promise<boolean>;
      checkInterval: string;
    },
    options?: AdvancedScheduleOptions
  ): Promise<ScheduleHandle> {
    // Implement conditional logic through a wrapper workflow
    const conditionalConfig: ScheduleConfig = {
      ...baseConfig,
      workflowType: 'conditionalWorkflowWrapper',
      workflowArgs: [
        baseConfig.workflowType,
        baseConfig.workflowArgs,
        condition
      ]
    };

    return await this.createSchedule(scheduleId, conditionalConfig, options);
  }

  async createChainedSchedule(
    scheduleId: string,
    scheduleChain: ScheduleConfig[],
    options?: AdvancedScheduleOptions
  ): Promise<ScheduleHandle[]> {
    const handles: ScheduleHandle[] = [];
    
    for (let i = 0; i < scheduleChain.length; i++) {
      const chainId = `${scheduleId}-chain-${i}`;
      const config = scheduleChain[i];
      
      // Add dependency on previous schedule if not the first
      if (i > 0) {
        config.dependsOn = [`${scheduleId}-chain-${i - 1}`];
      }
      
      const handle = await this.createSchedule(chainId, config, options);
      handles.push(handle);
    }
    
    return handles;
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private buildScheduleSpec(config: ScheduleConfig): ScheduleSpec {
    const spec: ScheduleSpec = {};

    if (config.cronExpression) {
      spec.cronExpressions = Array.isArray(config.cronExpression) 
        ? config.cronExpression 
        : [config.cronExpression];
    }

    if (config.intervals) {
      spec.intervals = config.intervals.map(interval => ({
        every: interval.every,
        offset: interval.offset
      }));
    }

    if (config.calendars) {
      spec.calendars = config.calendars;
    }

    if (config.timeZone) {
      spec.timeZone = config.timeZone;
    }

    if (config.jitter) {
      spec.jitter = config.jitter;
    }

    return spec;
  }

  private buildSchedulePolicy(
    config: ScheduleConfig, 
    options?: AdvancedScheduleOptions
  ): SchedulePolicy {
    const policy: SchedulePolicy = {};

    if (config.overlap) {
      policy.overlap = config.overlap;
    }

    if (config.catchupWindow) {
      policy.catchupWindow = config.catchupWindow;
    }

    if (config.pauseOnFailure !== undefined) {
      policy.pauseOnFailure = config.pauseOnFailure;
    }

    if (options?.keepAliveTime) {
      policy.keepAlive = options.keepAliveTime;
    }

    return policy;
  }

  private buildRecurringScheduleConfig(
    pattern: RecurrencePattern,
    workflowConfig: any
  ): ScheduleConfig {
    const config: ScheduleConfig = {
      ...workflowConfig,
      cronExpression: this.convertPatternToCron(pattern),
      description: `Recurring schedule: ${pattern.type}`
    };

    return config;
  }

  private convertPatternToCron(pattern: RecurrencePattern): string {
    switch (pattern.type) {
      case 'hourly':
        return `0 ${pattern.minute || 0} * * * *`;
      case 'daily':
        return `0 ${pattern.minute || 0} ${pattern.hour || 0} * * *`;
      case 'weekly':
        return `0 ${pattern.minute || 0} ${pattern.hour || 0} * * ${pattern.dayOfWeek || 0}`;
      case 'monthly':
        return `0 ${pattern.minute || 0} ${pattern.hour || 0} ${pattern.dayOfMonth || 1} * *`;
      case 'yearly':
        return `0 ${pattern.minute || 0} ${pattern.hour || 0} ${pattern.dayOfMonth || 1} ${pattern.month || 1} *`;
      case 'custom':
        return pattern.cronExpression!;
      default:
        throw new Error(`Unsupported recurrence pattern: ${pattern.type}`);
    }
  }

  private initializeScheduleMetrics(scheduleId: string, config: ScheduleConfig): void {
    this.scheduleMetrics.set(scheduleId, {
      scheduleId,
      state: 'active',
      executionCount: 0,
      failureCount: 0,
      manualTriggers: 0,
      lastExecution: null,
      nextExecution: null,
      averageExecutionTime: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  private updateScheduleMetrics(scheduleId: string, updates: Partial<ScheduleMetrics>): void {
    const current = this.scheduleMetrics.get(scheduleId);
    if (current) {
      this.scheduleMetrics.set(scheduleId, {
        ...current,
        ...updates,
        updatedAt: new Date()
      });
    }
  }

  private setupScheduleMonitoring(scheduleId: string, handle: ScheduleHandle): void {
    // Set up periodic monitoring
    setInterval(async () => {
      try {
        const description = await handle.describe();
        
        this.updateScheduleMetrics(scheduleId, {
          state: description.schedule.state.paused ? 'paused' : 'active',
          nextExecution: description.schedule.state.nextAction,
          // Add more metrics from description as needed
        });
      } catch (error) {
        console.error(`Failed to monitor schedule ${scheduleId}:`, error);
      }
    }, 60000); // Monitor every minute
  }

  // ========================================================================
  // Metrics and Monitoring
  // ========================================================================

  getScheduleMetrics(scheduleId?: string): ScheduleMetrics | Map<string, ScheduleMetrics> {
    if (scheduleId) {
      const metrics = this.scheduleMetrics.get(scheduleId);
      if (!metrics) {
        throw new Error(`No metrics found for schedule: ${scheduleId}`);
      }
      return metrics;
    }
    
    return new Map(this.scheduleMetrics);
  }

  async getScheduleSummary(): Promise<{
    totalSchedules: number;
    activeSchedules: number;
    pausedSchedules: number;
    totalExecutions: number;
    totalFailures: number;
    averageSuccessRate: number;
  }> {
    const metrics = Array.from(this.scheduleMetrics.values());
    
    const totalSchedules = metrics.length;
    const activeSchedules = metrics.filter(m => m.state === 'active').length;
    const pausedSchedules = metrics.filter(m => m.state === 'paused').length;
    const totalExecutions = metrics.reduce((sum, m) => sum + m.executionCount, 0);
    const totalFailures = metrics.reduce((sum, m) => sum + m.failureCount, 0);
    const averageSuccessRate = totalExecutions > 0 
      ? ((totalExecutions - totalFailures) / totalExecutions) * 100 
      : 100;

    return {
      totalSchedules,
      activeSchedules,
      pausedSchedules,
      totalExecutions,
      totalFailures,
      averageSuccessRate
    };
  }

  startMonitoring(): void {
    if (this.monitoring) return;

    this.monitoring = true;
    console.log('Schedule monitoring started');
  }

  stopMonitoring(): void {
    this.monitoring = false;
    console.log('Schedule monitoring stopped');
  }

  // ========================================================================
  // Cleanup and Utilities
  // ========================================================================

  async cleanup(): Promise<void> {
    console.log('Cleaning up schedule manager...');
    
    this.stopMonitoring();
    this.activeSchedules.clear();
    this.scheduleMetrics.clear();
    
    console.log('Schedule manager cleanup completed');
  }

  getActiveScheduleIds(): string[] {
    return Array.from(this.activeSchedules.keys());
  }

  hasSchedule(scheduleId: string): boolean {
    return this.activeSchedules.has(scheduleId);
  }
}

// ============================================================================
// Timer Manager
// ============================================================================

export class TimerManager {
  private static instance: TimerManager;
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private timerMetrics = new Map<string, TimerMetrics>();

  private constructor() {}

  static getInstance(): TimerManager {
    if (!TimerManager.instance) {
      TimerManager.instance = new TimerManager();
    }
    return TimerManager.instance;
  }

  // ========================================================================
  // Timer Management
  // ========================================================================

  createTimer(
    timerId: string,
    config: TimerConfig,
    callback: () => Promise<void> | void
  ): void {
    if (this.activeTimers.has(timerId)) {
      this.clearTimer(timerId);
    }

    console.log(`Creating timer: ${timerId}`, config);

    const timer = setTimeout(async () => {
      const startTime = Date.now();
      
      try {
        this.updateTimerMetrics(timerId, { executionCount: 1 });
        
        await callback();
        
        const executionTime = Date.now() - startTime;
        this.updateTimerMetrics(timerId, { 
          lastExecution: new Date(),
          averageExecutionTime: executionTime,
          state: 'completed'
        });
        
        console.log(`Timer executed successfully: ${timerId} (${executionTime}ms)`);
        
        // Handle recurring timers
        if (config.recurring) {
          this.createTimer(timerId, config, callback);
        } else {
          this.activeTimers.delete(timerId);
        }
        
      } catch (error) {
        this.updateTimerMetrics(timerId, { 
          failureCount: 1,
          state: 'failed',
          lastError: error instanceof Error ? error.message : String(error)
        });
        
        console.error(`Timer execution failed: ${timerId}`, error);
        
        // Handle retry logic
        if (config.retryOnFailure && (this.timerMetrics.get(timerId)?.failureCount || 0) < (config.maxRetries || 3)) {
          const retryDelay = config.retryDelay || config.delay;
          console.log(`Retrying timer in ${retryDelay}ms: ${timerId}`);
          
          setTimeout(() => {
            this.createTimer(timerId, config, callback);
          }, retryDelay);
        } else {
          this.activeTimers.delete(timerId);
        }
      }
    }, config.delay);

    this.activeTimers.set(timerId, timer);
    this.initializeTimerMetrics(timerId, config);
  }

  createRecurringTimer(
    timerId: string,
    interval: number,
    callback: () => Promise<void> | void,
    options?: {
      immediate?: boolean;
      maxExecutions?: number;
      endTime?: Date;
    }
  ): void {
    let executionCount = 0;
    const maxExecutions = options?.maxExecutions;
    const endTime = options?.endTime;

    const executeCallback = async () => {
      // Check if we should stop
      if (maxExecutions && executionCount >= maxExecutions) {
        this.clearTimer(timerId);
        return;
      }

      if (endTime && new Date() >= endTime) {
        this.clearTimer(timerId);
        return;
      }

      try {
        await callback();
        executionCount++;
        this.updateTimerMetrics(timerId, { 
          executionCount: executionCount,
          lastExecution: new Date()
        });
      } catch (error) {
        this.updateTimerMetrics(timerId, { 
          failureCount: 1,
          lastError: error instanceof Error ? error.message : String(error)
        });
        console.error(`Recurring timer execution failed: ${timerId}`, error);
      }
    };

    if (options?.immediate) {
      executeCallback();
    }

    const timer = setInterval(executeCallback, interval);
    this.activeTimers.set(timerId, timer);
    this.initializeTimerMetrics(timerId, { delay: interval, recurring: true });
  }

  clearTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.activeTimers.delete(timerId);
      this.updateTimerMetrics(timerId, { state: 'cancelled' });
      console.log(`Timer cleared: ${timerId}`);
    }
  }

  clearAllTimers(): void {
    console.log('Clearing all timers...');
    
    for (const [timerId, timer] of this.activeTimers.entries()) {
      clearTimeout(timer);
      clearInterval(timer);
      this.updateTimerMetrics(timerId, { state: 'cancelled' });
    }
    
    this.activeTimers.clear();
    console.log('All timers cleared');
  }

  // ========================================================================
  // Timer Utilities
  // ========================================================================

  hasTimer(timerId: string): boolean {
    return this.activeTimers.has(timerId);
  }

  getActiveTimerIds(): string[] {
    return Array.from(this.activeTimers.keys());
  }

  getTimerMetrics(timerId?: string): TimerMetrics | Map<string, TimerMetrics> {
    if (timerId) {
      const metrics = this.timerMetrics.get(timerId);
      if (!metrics) {
        throw new Error(`No metrics found for timer: ${timerId}`);
      }
      return metrics;
    }
    
    return new Map(this.timerMetrics);
  }

  private initializeTimerMetrics(timerId: string, config: TimerConfig): void {
    this.timerMetrics.set(timerId, {
      timerId,
      state: 'active',
      executionCount: 0,
      failureCount: 0,
      lastExecution: null,
      averageExecutionTime: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      config
    });
  }

  private updateTimerMetrics(timerId: string, updates: Partial<TimerMetrics>): void {
    const current = this.timerMetrics.get(timerId);
    if (current) {
      this.timerMetrics.set(timerId, {
        ...current,
        ...updates,
        updatedAt: new Date()
      });
    }
  }
}

// ============================================================================
// High-Level Scheduling Service
// ============================================================================

export class SchedulingService {
  private scheduleManager: ScheduleManager;
  private timerManager: TimerManager;
  private client: TemporalClient;

  constructor(client: TemporalClient) {
    this.client = client;
    this.scheduleManager = ScheduleManager.getInstance();
    this.timerManager = TimerManager.getInstance();
  }

  static async create(client: TemporalClient): Promise<SchedulingService> {
    const temporalClient = await client.client;
    await ScheduleManager.create(temporalClient);
    return new SchedulingService(client);
  }

  // Delegate methods to appropriate managers
  async createSchedule(id: string, config: ScheduleConfig, options?: AdvancedScheduleOptions) {
    return await this.scheduleManager.createSchedule(id, config, options);
  }

  createTimer(id: string, config: TimerConfig, callback: () => Promise<void> | void) {
    return this.timerManager.createTimer(id, config, callback);
  }

  async getSchedulingMetrics() {
    const scheduleMetrics = await this.scheduleManager.getScheduleSummary();
    const timerMetrics = this.timerManager.getTimerMetrics();
    
    return {
      schedules: scheduleMetrics,
      timers: {
        total: timerMetrics instanceof Map ? timerMetrics.size : 1,
        active: Array.from(timerMetrics instanceof Map ? timerMetrics.values() : [timerMetrics])
          .filter(m => m.state === 'active').length
      }
    };
  }

  async cleanup() {
    await this.scheduleManager.cleanup();
    this.timerManager.clearAllTimers();
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  ScheduleManager,
  TimerManager,
  SchedulingService
};

export default SchedulingService;