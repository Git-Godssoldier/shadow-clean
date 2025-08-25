/**
 * Scheduled Workflow Example
 * Demonstrates cron-based scheduling and recurring workflows
 */

import { Connection, Client, ScheduleClient, ScheduleHandle } from '@temporalio/client';
import { cronScheduledWorkflow, intervalScheduledWorkflow } from '../src/workflows/scheduled.workflow';
import { ScheduleManager } from '../src/schedules';

async function runScheduledWorkflow() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const client = new Client({
    connection,
    namespace: 'default'
  });

  // Example 1: Cron-based schedule (every 5 minutes)
  console.log('Creating cron-based scheduled workflow...');
  
  const scheduleManager = await ScheduleManager.create(client);
  
  const cronSchedule = await scheduleManager.createSchedule(
    'daily-report-schedule',
    {
      workflowType: 'cronScheduledWorkflow',
      taskQueue: 'scheduled-tasks',
      cronExpression: '0 */5 * * * *', // Every 5 minutes
      workflowArgs: [{
        cronExpression: '0 */5 * * * *',
        taskTemplate: {
          id: 'scheduled-task',
          type: 'report_generation',
          payload: {
            reportType: 'daily',
            recipients: ['admin@example.com']
          },
          priority: 'normal',
          timeout: '10m',
          metadata: {}
        },
        maxExecutions: 10,
        timezone: 'America/Los_Angeles'
      }],
      description: 'Daily report generation every 5 minutes',
      overlap: 'SKIP', // Skip if previous execution is still running
      pauseOnFailure: true
    }
  );

  console.log('Cron schedule created successfully');

  // Example 2: Interval-based workflow
  console.log('Starting interval-based workflow...');
  
  const intervalHandle = await client.workflow.start(intervalScheduledWorkflow, {
    taskQueue: 'scheduled-tasks',
    workflowId: `interval-workflow-${Date.now()}`,
    args: [{
      data: {
        intervalMs: 10000, // Every 10 seconds
        taskTemplate: {
          id: 'health-check',
          type: 'system_health_check',
          payload: {
            services: ['api', 'database', 'cache']
          },
          priority: 'high',
          timeout: '1m',
          metadata: {}
        },
        maxExecutions: 5,
        jitterMs: 2000 // Add 0-2 seconds of random jitter
      },
      context: {
        workflowId: `interval-workflow-${Date.now()}`,
        taskQueue: 'scheduled-tasks',
        namespace: 'default',
        startedAt: new Date(),
        metadata: {}
      }
    }]
  });

  console.log(`Interval workflow started: ${intervalHandle.workflowId}`);

  // Example 3: Manage schedules
  setTimeout(async () => {
    console.log('\nSchedule management operations:');
    
    // Get schedule info
    const info = await scheduleManager.getScheduleInfo('daily-report-schedule');
    console.log('Schedule info:', info.schedule.state);
    
    // Pause schedule
    await scheduleManager.pauseSchedule('daily-report-schedule');
    console.log('Schedule paused');
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Resume schedule
    await scheduleManager.resumeSchedule('daily-report-schedule');
    console.log('Schedule resumed');
    
    // Trigger schedule manually
    await scheduleManager.triggerSchedule('daily-report-schedule');
    console.log('Schedule triggered manually');
    
    // Get schedule history
    const history = await scheduleManager.getScheduleHistory('daily-report-schedule', 10);
    console.log(`Schedule history: ${history.length} executions`);
    
  }, 15000);

  // Wait for interval workflow to complete
  const intervalResult = await intervalHandle.result();
  console.log('Interval workflow completed:', intervalResult);

  // Clean up
  setTimeout(async () => {
    await scheduleManager.deleteSchedule('daily-report-schedule');
    console.log('Schedule deleted');
    await scheduleManager.cleanup();
    process.exit(0);
  }, 60000);
}

// Advanced scheduling patterns
async function advancedScheduling() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const client = new Client({
    connection,
    namespace: 'default'
  });

  const scheduleManager = await ScheduleManager.create(client);

  // 1. Business hours schedule (Monday-Friday, 9 AM - 5 PM)
  await scheduleManager.createSchedule('business-hours-monitor', {
    workflowType: 'monitoringWorkflow',
    taskQueue: 'monitoring-tasks',
    cronExpression: '0 */30 9-17 * * MON-FRI', // Every 30 minutes during business hours
    workflowArgs: [{
      monitorType: 'business_metrics',
      alertThreshold: 0.95
    }],
    description: 'Business hours monitoring'
  });

  // 2. Monthly billing schedule (1st of each month at 2 AM)
  await scheduleManager.createSchedule('monthly-billing', {
    workflowType: 'billingWorkflow',
    taskQueue: 'billing-tasks',
    cronExpression: '0 0 2 1 * *', // 2 AM on the 1st of each month
    workflowArgs: [{
      billingPeriod: 'monthly',
      generateInvoices: true,
      sendNotifications: true
    }],
    description: 'Monthly billing process',
    catchupWindow: '7d', // Process missed executions up to 7 days
    pauseOnFailure: true
  });

  // 3. Recurring schedule with dependencies
  const scheduleChain = await scheduleManager.createChainedSchedule(
    'data-pipeline',
    [
      {
        workflowType: 'dataExtractionWorkflow',
        taskQueue: 'etl-tasks',
        cronExpression: '0 0 0 * * *', // Midnight daily
        workflowArgs: [{ source: 'production_db' }],
        description: 'Extract data'
      },
      {
        workflowType: 'dataTransformationWorkflow',
        taskQueue: 'etl-tasks',
        cronExpression: '0 0 1 * * *', // 1 AM daily
        workflowArgs: [{ transformationType: 'aggregate' }],
        description: 'Transform data',
        dependsOn: ['data-pipeline-chain-0']
      },
      {
        workflowType: 'dataLoadingWorkflow',
        taskQueue: 'etl-tasks',
        cronExpression: '0 0 2 * * *', // 2 AM daily
        workflowArgs: [{ destination: 'data_warehouse' }],
        description: 'Load data',
        dependsOn: ['data-pipeline-chain-1']
      }
    ]
  );

  console.log(`Created ${scheduleChain.length} chained schedules`);

  // 4. Dynamic schedule based on conditions
  await scheduleManager.createConditionalSchedule(
    'conditional-backup',
    {
      workflowType: 'backupWorkflow',
      taskQueue: 'backup-tasks',
      cronExpression: '0 */15 * * * *', // Check every 15 minutes
      workflowArgs: [{ backupType: 'incremental' }]
    },
    {
      predicate: async () => {
        // Only run backup if system load is low
        const systemLoad = await getSystemLoad();
        return systemLoad < 0.7;
      },
      checkInterval: '15m'
    }
  );

  console.log('Advanced schedules created successfully');
}

// Helper function
async function getSystemLoad(): Promise<number> {
  // Simulated system load check
  return Math.random();
}

// Main execution
if (require.main === module) {
  const mode = process.argv[2];
  
  if (mode === 'basic') {
    runScheduledWorkflow().catch(err => {
      console.error('Scheduled workflow failed:', err);
      process.exit(1);
    });
  } else if (mode === 'advanced') {
    advancedScheduling()
      .then(() => {
        console.log('Advanced scheduling setup complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('Advanced scheduling failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Basic scheduling: ts-node scheduled-workflow.ts basic');
    console.log('  Advanced scheduling: ts-node scheduled-workflow.ts advanced');
    process.exit(1);
  }
}

export { runScheduledWorkflow, advancedScheduling };