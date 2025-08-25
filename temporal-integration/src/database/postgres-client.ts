/**
 * PostgreSQL Database Client with Connection Pooling
 * Production-ready database integration for Temporal workflows
 */

import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';
import { z } from 'zod';

// Database configuration schema
const DatabaseConfigSchema = z.object({
  connectionString: z.string().optional(),
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  database: z.string().default('temporal'),
  user: z.string().default('temporal'),
  password: z.string().optional(),
  max: z.number().default(20), // Maximum pool size
  idleTimeoutMillis: z.number().default(30000),
  connectionTimeoutMillis: z.number().default(2000),
  ssl: z.union([
    z.boolean(),
    z.object({
      rejectUnauthorized: z.boolean().optional(),
      ca: z.string().optional(),
      cert: z.string().optional(),
      key: z.string().optional()
    })
  ]).optional()
});

type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * PostgreSQL Client with connection pooling and retry logic
 */
export class PostgreSQLClient {
  private pool: Pool;
  private config: DatabaseConfig;
  private isConnected: boolean = false;
  private connectionRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(config?: Partial<DatabaseConfig>) {
    // Parse and validate configuration
    this.config = DatabaseConfigSchema.parse({
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      ...config
    });

    // Create connection pool
    this.pool = new Pool(this.config as PoolConfig);

    // Set up error handlers
    this.pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
      this.isConnected = false;
    });

    this.pool.on('connect', () => {
      console.log('New client connected to pool');
      this.isConnected = true;
    });

    this.pool.on('remove', () => {
      console.log('Client removed from pool');
    });
  }

  /**
   * Initialize connection and verify database
   */
  async initialize(): Promise<void> {
    for (let i = 0; i < this.connectionRetries; i++) {
      try {
        const client = await this.pool.connect();
        
        // Test connection
        await client.query('SELECT NOW()');
        
        // Create tables if they don't exist
        await this.createTables(client);
        
        client.release();
        this.isConnected = true;
        console.log('PostgreSQL client initialized successfully');
        return;
      } catch (error) {
        console.error(`Connection attempt ${i + 1} failed:`, error);
        if (i < this.connectionRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          throw new Error(`Failed to connect to database after ${this.connectionRetries} attempts`);
        }
      }
    }
  }

  /**
   * Create required tables
   */
  private async createTables(client: PoolClient): Promise<void> {
    const queries = [
      // Workflow executions table
      `CREATE TABLE IF NOT EXISTS workflow_executions (
        id SERIAL PRIMARY KEY,
        workflow_id VARCHAR(255) UNIQUE NOT NULL,
        workflow_type VARCHAR(100) NOT NULL,
        task_queue VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        input JSONB,
        output JSONB,
        error TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Activity executions table
      `CREATE TABLE IF NOT EXISTS activity_executions (
        id SERIAL PRIMARY KEY,
        activity_id VARCHAR(255) NOT NULL,
        workflow_id VARCHAR(255) NOT NULL,
        activity_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        input JSONB,
        output JSONB,
        error TEXT,
        attempts INTEGER DEFAULT 1,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Processed data table (for data pipeline)
      `CREATE TABLE IF NOT EXISTS processed_data (
        id SERIAL PRIMARY KEY,
        pipeline_id VARCHAR(255) NOT NULL,
        record_id VARCHAR(255),
        data JSONB NOT NULL,
        processing_status VARCHAR(50),
        error_message TEXT,
        processed_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      )`,
      
      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id)`,
      `CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_executions_workflow_id ON activity_executions(workflow_id)`,
      `CREATE INDEX IF NOT EXISTS idx_processed_data_pipeline_id ON processed_data(pipeline_id)`
    ];

    for (const query of queries) {
      await client.query(query);
    }
  }

  /**
   * Execute a query with automatic retry
   */
  async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    let lastError;
    
    for (let i = 0; i < this.connectionRetries; i++) {
      try {
        const result = await this.pool.query<T>(text, params);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`Query attempt ${i + 1} failed:`, error);
        
        // Check if error is retryable
        if (this.isRetryableError(error)) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
        } else {
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch insert with transaction
   */
  async batchInsert(
    table: string,
    records: any[],
    batchSize: number = 1000
  ): Promise<number> {
    let totalInserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      await this.transaction(async (client) => {
        for (const record of batch) {
          const columns = Object.keys(record);
          const values = Object.values(record);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
          
          const query = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `;
          
          await client.query(query, values);
          totalInserted++;
        }
      });
    }

    return totalInserted;
  }

  /**
   * Store workflow execution
   */
  async storeWorkflowExecution(data: {
    workflowId: string;
    workflowType: string;
    taskQueue: string;
    status: string;
    input?: any;
    output?: any;
    error?: string;
    metadata?: any;
  }): Promise<void> {
    const query = `
      INSERT INTO workflow_executions 
      (workflow_id, workflow_type, task_queue, status, input, output, error, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (workflow_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        output = EXCLUDED.output,
        error = EXCLUDED.error,
        completed_at = CASE 
          WHEN EXCLUDED.status IN ('completed', 'failed', 'cancelled') 
          THEN NOW() 
          ELSE workflow_executions.completed_at 
        END,
        updated_at = NOW()
    `;

    await this.query(query, [
      data.workflowId,
      data.workflowType,
      data.taskQueue,
      data.status,
      JSON.stringify(data.input),
      JSON.stringify(data.output),
      data.error,
      JSON.stringify(data.metadata)
    ]);
  }

  /**
   * Store activity execution
   */
  async storeActivityExecution(data: {
    activityId: string;
    workflowId: string;
    activityType: string;
    status: string;
    input?: any;
    output?: any;
    error?: string;
    attempts?: number;
    metadata?: any;
  }): Promise<void> {
    const query = `
      INSERT INTO activity_executions 
      (activity_id, workflow_id, activity_type, status, input, output, error, attempts, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.query(query, [
      data.activityId,
      data.workflowId,
      data.activityType,
      data.status,
      JSON.stringify(data.input),
      JSON.stringify(data.output),
      data.error,
      data.attempts || 1,
      JSON.stringify(data.metadata)
    ]);
  }

  /**
   * Store processed data (for data pipeline)
   */
  async storeProcessedData(
    pipelineId: string,
    records: any[]
  ): Promise<number> {
    const transformedRecords = records.map(record => ({
      pipeline_id: pipelineId,
      record_id: record.id || null,
      data: JSON.stringify(record),
      processing_status: 'completed',
      metadata: JSON.stringify({ timestamp: new Date() })
    }));

    return this.batchInsert('processed_data', transformedRecords);
  }

  /**
   * Get workflow execution history
   */
  async getWorkflowHistory(workflowId: string): Promise<any[]> {
    const query = `
      SELECT * FROM workflow_executions 
      WHERE workflow_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await this.query(query, [workflowId]);
    return result.rows;
  }

  /**
   * Get activity execution history
   */
  async getActivityHistory(workflowId: string): Promise<any[]> {
    const query = `
      SELECT * FROM activity_executions 
      WHERE workflow_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await this.query(query, [workflowId]);
    return result.rows;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      '57P03', // cannot_connect_now
      '08006', // connection_failure
      '08001', // sqlclient_unable_to_establish_sqlconnection
    ];

    return retryableCodes.some(code => 
      error.code === code || error.message?.includes(code)
    );
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch {
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    console.log('PostgreSQL connection pool closed');
  }
}

// Singleton instance
let instance: PostgreSQLClient | null = null;

/**
 * Get PostgreSQL client instance
 */
export function getPostgreSQLClient(config?: Partial<DatabaseConfig>): PostgreSQLClient {
  if (!instance) {
    instance = new PostgreSQLClient(config);
  }
  return instance;
}

export default PostgreSQLClient;