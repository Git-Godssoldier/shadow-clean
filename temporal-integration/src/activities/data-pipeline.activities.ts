/**
 * Data Pipeline Activities
 * Real-world activities for data processing pipeline
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { parse } from 'csv-parse';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';

// Activity: Download file from URL
export async function downloadFile(input: {
  url: string;
  workflowId: string;
}): Promise<string> {
  console.log(`Downloading file from ${input.url}`);
  
  const tempDir = path.join('/tmp', 'temporal-pipeline', input.workflowId);
  await fs.mkdir(tempDir, { recursive: true });
  
  const fileName = `download-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  const filePath = path.join(tempDir, fileName);
  
  try {
    const response = await axios({
      method: 'GET',
      url: input.url,
      responseType: 'stream',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024, // 100MB limit
    });
    
    const writer = createWriteStream(filePath);
    await pipeline(response.data, writer);
    
    // Verify file was written
    const stats = await fs.stat(filePath);
    console.log(`Downloaded file: ${filePath} (${stats.size} bytes)`);
    
    return filePath;
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Activity: Validate CSV file
export async function validateCSV(input: {
  filePath: string;
  expectedFormat: string;
  rules: {
    maxFileSize: number;
    requiredColumns: string[];
    encoding: string;
  };
}): Promise<{
  isValid: boolean;
  errors: string[];
  recordCount?: number;
}> {
  console.log(`Validating CSV file: ${input.filePath}`);
  const errors: string[] = [];
  
  try {
    // Check file exists
    const stats = await fs.stat(input.filePath);
    
    // Check file size
    if (stats.size > input.rules.maxFileSize) {
      errors.push(`File size ${stats.size} exceeds maximum ${input.rules.maxFileSize}`);
    }
    
    // Parse CSV headers
    let recordCount = 0;
    const headers: string[] = [];
    
    return new Promise((resolve) => {
      const parser = parse({
        delimiter: ',',
        columns: true,
        skip_records_with_error: true,
        max_record_size: 1024 * 1024, // 1MB per record
      });
      
      const stream = createReadStream(input.filePath);
      
      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          if (recordCount === 0 && record) {
            Object.keys(record).forEach(key => headers.push(key));
          }
          recordCount++;
        }
      });
      
      parser.on('error', (err) => {
        errors.push(`CSV parsing error: ${err.message}`);
      });
      
      parser.on('end', () => {
        // Check required columns
        const missingColumns = input.rules.requiredColumns.filter(
          col => !headers.includes(col)
        );
        
        if (missingColumns.length > 0) {
          errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }
        
        resolve({
          isValid: errors.length === 0,
          errors,
          recordCount
        });
      });
      
      stream.pipe(parser);
    });
    
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      errors
    };
  }
}

// Activity: Parse CSV data
export async function parseCSVData(input: {
  filePath: string;
  format: string;
  options: {
    delimiter: string;
    headers: boolean;
    skipEmptyRows: boolean;
  };
}): Promise<{
  records: any[];
  headers: string[];
}> {
  console.log(`Parsing CSV data from ${input.filePath}`);
  
  const records: any[] = [];
  const headers: string[] = [];
  
  return new Promise((resolve, reject) => {
    const parser = parse({
      delimiter: input.options.delimiter,
      columns: input.options.headers,
      skip_empty_lines: input.options.skipEmptyRows,
      relax_quotes: true,
    });
    
    const stream = createReadStream(input.filePath);
    
    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        if (headers.length === 0 && record) {
          Object.keys(record).forEach(key => headers.push(key));
        }
        records.push(record);
      }
    });
    
    parser.on('error', reject);
    
    parser.on('end', () => {
      console.log(`Parsed ${records.length} records`);
      resolve({ records, headers });
    });
    
    stream.pipe(parser);
  });
}

// Activity: Transform data
export async function transformData(input: {
  data: any[];
  rules: {
    mapping: Record<string, string>;
    filters?: Array<{ field: string; operator: string; value: any }>;
    aggregations?: Array<{ field: string; operation: string }>;
  };
  options: {
    batchSize: number;
    parallel: boolean;
    errorHandling: 'skip' | 'fail' | 'default';
  };
}): Promise<{
  data: any[];
  successCount: number;
  errors: string[];
}> {
  console.log(`Transforming ${input.data.length} records`);
  
  const transformed: any[] = [];
  const errors: string[] = [];
  let successCount = 0;
  
  for (const record of input.data) {
    try {
      // Apply mapping
      const mappedRecord: any = {};
      for (const [oldKey, newKey] of Object.entries(input.rules.mapping)) {
        if (record.hasOwnProperty(oldKey)) {
          mappedRecord[newKey] = record[oldKey];
        }
      }
      
      // Apply filters
      if (input.rules.filters) {
        let shouldInclude = true;
        for (const filter of input.rules.filters) {
          const value = mappedRecord[filter.field];
          switch (filter.operator) {
            case 'equals':
              shouldInclude = value === filter.value;
              break;
            case 'contains':
              shouldInclude = String(value).includes(filter.value);
              break;
            case 'greater_than':
              shouldInclude = Number(value) > filter.value;
              break;
            case 'less_than':
              shouldInclude = Number(value) < filter.value;
              break;
            default:
              shouldInclude = true;
          }
          if (!shouldInclude) break;
        }
        if (!shouldInclude) continue;
      }
      
      transformed.push(mappedRecord);
      successCount++;
      
    } catch (error) {
      const errorMsg = `Transform error for record: ${error instanceof Error ? error.message : 'Unknown'}`;
      errors.push(errorMsg);
      
      if (input.options.errorHandling === 'fail') {
        throw new Error(errorMsg);
      }
    }
  }
  
  console.log(`Transformed ${successCount} records successfully`);
  
  return {
    data: transformed,
    successCount,
    errors
  };
}

// Activity: Enrich data with external sources
export async function enrichData(input: {
  data: any[];
  config: {
    apiEndpoint?: string;
    lookupTable?: string;
    joinKey?: string;
  };
  options: {
    cacheResults: boolean;
    retryFailedEnrichments: boolean;
    timeout: number;
  };
}): Promise<{
  data: any[];
  enrichedCount: number;
}> {
  console.log(`Enriching ${input.data.length} records`);
  
  let enrichedCount = 0;
  const enrichedData = [...input.data];
  
  // Simulate enrichment (in real implementation, would call external APIs)
  for (let i = 0; i < enrichedData.length; i++) {
    try {
      // Add enrichment fields
      enrichedData[i].enrichedAt = new Date().toISOString();
      enrichedData[i].enrichmentSource = input.config.apiEndpoint || 'internal';
      
      // Simulate API call delay
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      enrichedCount++;
    } catch (error) {
      console.error(`Failed to enrich record ${i}:`, error);
      if (!input.options.retryFailedEnrichments) {
        throw error;
      }
    }
  }
  
  console.log(`Enriched ${enrichedCount} records`);
  
  return {
    data: enrichedData,
    enrichedCount
  };
}

// Activity: Validate transformed data
export async function validateTransformedData(input: {
  data: any[];
  schema: {
    required: string[];
    types: Record<string, string>;
    constraints: Record<string, any>;
  };
}): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  criticalErrors: number;
}> {
  console.log(`Validating ${input.data.length} transformed records`);
  
  const errors: string[] = [];
  const warnings: string[] = [];
  let criticalErrors = 0;
  
  for (let i = 0; i < input.data.length; i++) {
    const record = input.data[i];
    
    // Check required fields
    for (const field of input.schema.required) {
      if (!record.hasOwnProperty(field) || record[field] === null || record[field] === undefined) {
        errors.push(`Record ${i}: Missing required field '${field}'`);
        criticalErrors++;
      }
    }
    
    // Check data types
    for (const [field, expectedType] of Object.entries(input.schema.types)) {
      if (record.hasOwnProperty(field)) {
        const actualType = typeof record[field];
        if (actualType !== expectedType) {
          warnings.push(`Record ${i}: Field '${field}' has type '${actualType}', expected '${expectedType}'`);
        }
      }
    }
  }
  
  console.log(`Validation complete: ${errors.length} errors, ${warnings.length} warnings`);
  
  return {
    isValid: criticalErrors === 0,
    errors,
    warnings,
    criticalErrors
  };
}

// Activity: Store data in database
export async function storeInDatabase(input: {
  data: any[];
  config: {
    database: string;
    table: string;
    format: 'sql' | 'nosql' | 'warehouse';
    partitionKey?: string;
  };
  options: {
    batchSize: number;
    upsert: boolean;
    transactional: boolean;
  };
}): Promise<{
  recordsInserted: number;
  recordsUpdated: number;
  location: string;
}> {
  console.log(`Storing ${input.data.length} records to ${input.config.database}.${input.config.table}`);
  
  // Simulate database storage
  // In real implementation, would use appropriate database client
  
  let recordsInserted = 0;
  let recordsUpdated = 0;
  
  // Process in batches
  for (let i = 0; i < input.data.length; i += input.options.batchSize) {
    const batch = input.data.slice(i, i + input.options.batchSize);
    
    // Simulate batch insert
    await new Promise(resolve => setTimeout(resolve, 100));
    
    recordsInserted += batch.length;
    
    console.log(`Stored batch ${Math.floor(i / input.options.batchSize) + 1}`);
  }
  
  const location = `${input.config.database}.${input.config.table}`;
  console.log(`Stored ${recordsInserted} records to ${location}`);
  
  return {
    recordsInserted,
    recordsUpdated,
    location
  };
}

// Activity: Generate report
export async function generateReport(input: {
  pipelineId: string;
  stats: {
    totalRecords: number;
    processedRecords: number;
    failedRecords: number;
    duration: number;
    errors: string[];
  };
  outputLocation: string;
}): Promise<{
  url: string;
  path: string;
}> {
  console.log(`Generating report for pipeline ${input.pipelineId}`);
  
  const report = {
    pipelineId: input.pipelineId,
    timestamp: new Date().toISOString(),
    stats: input.stats,
    outputLocation: input.outputLocation,
    summary: {
      successRate: (input.stats.processedRecords / input.stats.totalRecords * 100).toFixed(2) + '%',
      avgProcessingTime: (input.stats.duration / input.stats.totalRecords).toFixed(2) + 'ms',
      status: input.stats.failedRecords === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS'
    }
  };
  
  // Save report to file
  const reportDir = path.join('/tmp', 'temporal-reports');
  await fs.mkdir(reportDir, { recursive: true });
  
  const reportPath = path.join(reportDir, `report-${input.pipelineId}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`Report generated at ${reportPath}`);
  
  return {
    url: `http://localhost:8233/reports/${input.pipelineId}`,
    path: reportPath
  };
}

// Activity: Send notification
export async function sendNotification(input: {
  config: {
    email?: string;
    slack?: string;
    webhook?: string;
  };
  message: {
    title: string;
    body: string;
    details: any;
  };
}): Promise<void> {
  console.log(`Sending notification: ${input.message.title}`);
  
  // Simulate sending notifications
  // In real implementation, would use email/Slack/webhook clients
  
  if (input.config.email) {
    console.log(`Email sent to ${input.config.email}`);
  }
  
  if (input.config.slack) {
    console.log(`Slack message sent to ${input.config.slack}`);
  }
  
  if (input.config.webhook) {
    try {
      // await axios.post(input.config.webhook, input.message);
      console.log(`Webhook called: ${input.config.webhook}`);
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }
}

// Activity: Cleanup temporary files
export async function cleanupTempFiles(input: {
  paths: string[];
}): Promise<void> {
  console.log(`Cleaning up ${input.paths.length} temporary files`);
  
  for (const filePath of input.paths) {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error);
    }
  }
  
  // Also try to remove empty directories
  for (const filePath of input.paths) {
    try {
      const dir = path.dirname(filePath);
      const files = await fs.readdir(dir);
      if (files.length === 0) {
        await fs.rmdir(dir);
        console.log(`Removed empty directory: ${dir}`);
      }
    } catch (error) {
      // Directory not empty or doesn't exist, ignore
    }
  }
}