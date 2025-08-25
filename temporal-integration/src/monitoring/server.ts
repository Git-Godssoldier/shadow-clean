/**
 * Monitoring Server for Temporal Integration
 * Exposes Prometheus metrics, health checks, and monitoring dashboards
 */

import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import * as promClient from 'prom-client';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import helmet from 'helmet';

import {
  MonitoringManager,
  MetricsCollector,
  AlertManager,
  HealthMonitor
} from './index';

import {
  MonitoringConfig,
  HealthStatus,
  AlertEvent,
  MetricsData,
  PerformanceMetrics
} from '../types';

// ============================================================================
// Monitoring Server
// ============================================================================

export class MonitoringServer {
  private app: Express;
  private server?: Server;
  private port: number;
  private monitoringManager: MonitoringManager;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private healthMonitor: HealthMonitor;
  private prometheusRegistry: promClient.Registry;
  private customMetrics: Map<string, any> = new Map();

  constructor(port = 9090, config?: MonitoringConfig) {
    this.port = port;
    this.app = express();
    
    // Initialize monitoring components
    this.monitoringManager = MonitoringManager.initialize(config || {
      enableMetrics: true,
      enableAlerts: true,
      enableHealthChecks: true,
      metricsIntervalMs: 10000,
      alertCheckIntervalMs: 30000
    });
    
    this.metricsCollector = MetricsCollector.getInstance();
    this.alertManager = AlertManager.getInstance();
    this.healthMonitor = HealthMonitor.getInstance();
    
    // Initialize Prometheus registry
    this.prometheusRegistry = new promClient.Registry();
    this.initializePrometheusMetrics();
    
    // Setup Express middleware
    this.setupMiddleware();
    
    // Setup routes
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: false // Disable for dashboard
    }));
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));
    
    // Compression
    this.app.use(compression());
    
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Logging
    this.app.use(morgan('combined'));
    
    // Static files for dashboard
    this.app.use('/dashboard', express.static('public'));
  }

  private initializePrometheusMetrics(): void {
    // Default Prometheus metrics
    promClient.collectDefaultMetrics({ register: this.prometheusRegistry });
    
    // Custom Temporal metrics
    this.customMetrics.set('workflows_started', new promClient.Counter({
      name: 'temporal_workflows_started_total',
      help: 'Total number of workflows started',
      labelNames: ['workflow_type', 'task_queue'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('workflows_completed', new promClient.Counter({
      name: 'temporal_workflows_completed_total',
      help: 'Total number of workflows completed',
      labelNames: ['workflow_type', 'task_queue', 'status'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('workflows_failed', new promClient.Counter({
      name: 'temporal_workflows_failed_total',
      help: 'Total number of workflows failed',
      labelNames: ['workflow_type', 'task_queue', 'error_type'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('workflow_duration', new promClient.Histogram({
      name: 'temporal_workflow_duration_seconds',
      help: 'Workflow execution duration in seconds',
      labelNames: ['workflow_type', 'task_queue'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('activities_started', new promClient.Counter({
      name: 'temporal_activities_started_total',
      help: 'Total number of activities started',
      labelNames: ['activity_type', 'task_queue'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('activities_completed', new promClient.Counter({
      name: 'temporal_activities_completed_total',
      help: 'Total number of activities completed',
      labelNames: ['activity_type', 'task_queue', 'status'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('activities_failed', new promClient.Counter({
      name: 'temporal_activities_failed_total',
      help: 'Total number of activities failed',
      labelNames: ['activity_type', 'task_queue', 'error_type'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('activity_duration', new promClient.Histogram({
      name: 'temporal_activity_duration_seconds',
      help: 'Activity execution duration in seconds',
      labelNames: ['activity_type', 'task_queue'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('worker_active', new promClient.Gauge({
      name: 'temporal_workers_active',
      help: 'Number of active workers',
      labelNames: ['task_queue'],
      registers: [this.prometheusRegistry]
    }));
    
    this.customMetrics.set('task_queue_length', new promClient.Gauge({
      name: 'temporal_task_queue_length',
      help: 'Current task queue length',
      labelNames: ['task_queue'],
      registers: [this.prometheusRegistry]
    }));
  }

  private updatePrometheusMetrics(): void {
    const metrics = this.metricsCollector.getMetrics();
    
    // Update Prometheus metrics from internal metrics
    // In a real implementation, these would be updated by the interceptors
    // This is a simplified example showing the structure
    
    const workflowsStarted = this.customMetrics.get('workflows_started') as promClient.Counter;
    const workflowsCompleted = this.customMetrics.get('workflows_completed') as promClient.Counter;
    const workflowsFailed = this.customMetrics.get('workflows_failed') as promClient.Counter;
    
    const activitiesStarted = this.customMetrics.get('activities_started') as promClient.Counter;
    const activitiesCompleted = this.customMetrics.get('activities_completed') as promClient.Counter;
    const activitiesFailed = this.customMetrics.get('activities_failed') as promClient.Counter;
    
    const workerActive = this.customMetrics.get('worker_active') as promClient.Gauge;
    const taskQueueLength = this.customMetrics.get('task_queue_length') as promClient.Gauge;
    
    // Update gauges
    workerActive.set({ task_queue: 'default' }, metrics.workers.active);
    taskQueueLength.set({ task_queue: 'default' }, metrics.workers.taskQueueLength);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const health = await this.healthMonitor.runHealthChecks();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: error instanceof Error ? error.message : 'Health check failed'
        });
      }
    });

    // Readiness probe
    this.app.get('/ready', async (req: Request, res: Response) => {
      try {
        const health = await this.healthMonitor.runHealthChecks();
        if (health.status === 'healthy') {
          res.status(200).json({ ready: true });
        } else {
          res.status(503).json({ ready: false, health });
        }
      } catch (error) {
        res.status(503).json({ ready: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Liveness probe
    this.app.get('/live', (req: Request, res: Response) => {
      res.status(200).json({ alive: true, timestamp: new Date() });
    });

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        this.updatePrometheusMetrics();
        const metrics = await this.prometheusRegistry.metrics();
        res.set('Content-Type', this.prometheusRegistry.contentType);
        res.end(metrics);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to collect metrics'
        });
      }
    });

    // JSON metrics endpoint
    this.app.get('/api/metrics', (req: Request, res: Response) => {
      const metrics = this.metricsCollector.getMetrics();
      const performance = this.metricsCollector.getPerformanceMetrics();
      res.json({ metrics, performance });
    });

    // Alerts endpoint
    this.app.get('/api/alerts', (req: Request, res: Response) => {
      const activeAlerts = this.alertManager.getActiveAlerts();
      const alertHistory = this.alertManager.getAlertHistory();
      const alertRules = this.alertManager.getAlertRules();
      res.json({ activeAlerts, alertHistory, alertRules });
    });

    // Alert rules management
    this.app.post('/api/alerts/rules', (req: Request, res: Response) => {
      try {
        const rule = req.body;
        this.alertManager.addRule(rule);
        res.status(201).json({ message: 'Alert rule created', rule });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Failed to create alert rule'
        });
      }
    });

    this.app.delete('/api/alerts/rules/:id', (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        this.alertManager.removeRule(id);
        res.json({ message: 'Alert rule deleted', id });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Failed to delete alert rule'
        });
      }
    });

    // System information
    this.app.get('/api/system', (req: Request, res: Response) => {
      const metrics = this.metricsCollector.getMetrics();
      const os = require('os');
      
      res.json({
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          uptime: os.uptime(),
          loadAverage: os.loadavg()
        },
        process: {
          version: process.version,
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        temporal: {
          uptime: metrics.system.uptime,
          lastUpdated: metrics.system.lastUpdated
        }
      });
    });

    // Dashboard data endpoint
    this.app.get('/api/dashboard', async (req: Request, res: Response) => {
      try {
        const metrics = this.metricsCollector.getMetrics();
        const performance = this.metricsCollector.getPerformanceMetrics();
        const health = await this.healthMonitor.runHealthChecks();
        const alerts = this.alertManager.getActiveAlerts();
        
        res.json({
          metrics,
          performance,
          health,
          alerts,
          timestamp: new Date()
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to collect dashboard data'
        });
      }
    });

    // WebSocket endpoint for real-time updates (simplified)
    this.app.get('/api/stream', (req: Request, res: Response) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      const interval = setInterval(() => {
        const metrics = this.metricsCollector.getMetrics();
        const performance = this.metricsCollector.getPerformanceMetrics();
        const alerts = this.alertManager.getActiveAlerts();
        
        const data = JSON.stringify({
          metrics,
          performance,
          alerts,
          timestamp: new Date()
        });
        
        res.write(`data: ${data}\n\n`);
      }, 5000);
      
      req.on('close', () => {
        clearInterval(interval);
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: err.message || 'Internal server error'
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      // Start monitoring manager
      this.monitoringManager.start();
      
      // Start server
      this.server = this.app.listen(this.port, () => {
        console.log(`Monitoring server started on http://localhost:${this.port}`);
        console.log(`Prometheus metrics available at http://localhost:${this.port}/metrics`);
        console.log(`Health check available at http://localhost:${this.port}/health`);
        console.log(`Dashboard available at http://localhost:${this.port}/dashboard`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.monitoringManager.stop();
        this.server.close(() => {
          console.log('Monitoring server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// ============================================================================
// Standalone Server
// ============================================================================

if (require.main === module) {
  const port = parseInt(process.env.MONITORING_PORT || '9090');
  const server = new MonitoringServer(port);
  
  server.start().then(() => {
    console.log('Monitoring server is running');
  }).catch((error) => {
    console.error('Failed to start monitoring server:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

// ============================================================================
// Export
// ============================================================================

export default MonitoringServer;