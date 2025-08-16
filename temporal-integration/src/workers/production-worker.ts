/**
 * Production Worker with Proper Configuration
 * Fixed TypeScript compilation and optimal settings
 */

import { Worker, NativeConnection, Runtime, DefaultLogger } from '@temporalio/worker';
import * as path from 'path';
import * as activities from '../activities';
import * as dataPipelineActivities from '../activities/data-pipeline.activities';
import { MonitoringInterceptor } from '../monitoring/interceptors';
import { SecurityInterceptor } from '../security/middleware';

// Configure runtime with production settings
async function configureRuntime() {
  Runtime.install({
    logger: new DefaultLogger('INFO'),
    telemetryOptions: {
      metrics: {
        prometheus: {
          bindAddress: '0.0.0.0:9090'
        }
      }
    }
  });
}

// Create worker with proper configuration
export async function createWorker(): Promise<Worker> {
  // Configure runtime
  await configureRuntime();
  
  // Create connection with native implementation
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    tls: process.env.NODE_ENV === 'production' ? {
      // Production TLS configuration
      clientCertPair: {
        crt: Buffer.from(process.env.TEMPORAL_CLIENT_CERT || ''),
        key: Buffer.from(process.env.TEMPORAL_CLIENT_KEY || '')
      },
      serverRootCACertificate: process.env.TEMPORAL_SERVER_ROOT_CA 
        ? Buffer.from(process.env.TEMPORAL_SERVER_ROOT_CA)
        : undefined
    } : undefined
  });

  // Combine all activities
  const allActivities = {
    ...activities,
    ...dataPipelineActivities
  };

  // Create worker with optimized settings
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'shadow-tasks',
    
    // Workflow configuration
    workflowsPath: path.resolve(__dirname, '../workflows'),
    
    // Activities configuration
    activities: allActivities,
    
    // Worker tuning for production
    maxConcurrentActivityTaskExecutions: parseInt(process.env.MAX_CONCURRENT_ACTIVITIES || '100'),
    maxConcurrentWorkflowTaskExecutions: parseInt(process.env.MAX_CONCURRENT_WORKFLOWS || '100'),
    maxConcurrentLocalActivityExecutions: parseInt(process.env.MAX_CONCURRENT_LOCAL_ACTIVITIES || '200'),
    
    // Cache configuration
    maxCachedWorkflows: parseInt(process.env.MAX_CACHED_WORKFLOWS || '1000'),
    
    // Performance optimizations
    reuseV8Context: true,
    debugMode: process.env.NODE_ENV !== 'production',
    
    // Identity for debugging
    identity: `worker-${process.env.HOSTNAME || 'localhost'}-${process.pid}`,
    
    // Build ID for versioning
    buildId: process.env.BUILD_ID || 'dev',
    useVersioning: process.env.USE_VERSIONING === 'true',
    
    // Interceptors for monitoring and security
    interceptors: {
      activity: [
        // Add monitoring interceptor
        () => new MonitoringInterceptor(),
        // Add security interceptor
        () => new SecurityInterceptor()
      ],
      workflowModules: [
        path.resolve(__dirname, '../monitoring/workflow-interceptor'),
        path.resolve(__dirname, '../security/workflow-interceptor')
      ]
    },
    
    // Shutdown configuration
    shutdownGraceTime: '30s',
    
    // Sticky execution
    enableNonLocalActivities: true,
    
    // Data converter (will be added when security is integrated)
    // dataConverter: await securityManager.getSecureDataConverter()
  });

  return worker;
}

// Health check function
export async function checkHealth(): Promise<boolean> {
  try {
    // Check worker is running
    // In production, would check actual worker status
    return true;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Graceful shutdown handler
export async function gracefulShutdown(worker: Worker): Promise<void> {
  console.log('Initiating graceful shutdown...');
  
  try {
    // Shutdown worker
    await worker.shutdown();
    console.log('Worker shutdown complete');
    
    // Clean up resources
    // Add any cleanup logic here
    
  } catch (error) {
    console.error('Error during shutdown:', error);
    throw error;
  }
}

// Main execution
if (require.main === module) {
  let worker: Worker | null = null;

  // Handle shutdown signals
  const shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  shutdownSignals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down...`);
      if (worker) {
        await gracefulShutdown(worker);
      }
      process.exit(0);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start worker
  (async () => {
    try {
      console.log('Starting production worker...');
      console.log('Configuration:', {
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'shadow-tasks',
        maxConcurrentActivities: process.env.MAX_CONCURRENT_ACTIVITIES || '100',
        maxConcurrentWorkflows: process.env.MAX_CONCURRENT_WORKFLOWS || '100'
      });

      worker = await createWorker();
      
      console.log('Worker created successfully, starting...');
      
      // Run worker
      await worker.run();
      
    } catch (error) {
      console.error('Failed to start worker:', error);
      process.exit(1);
    }
  })();
}

export default createWorker;