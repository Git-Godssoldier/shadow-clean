/**
 * Security Middleware for Temporal Workers and Clients
 * Implements authentication, authorization, and audit logging
 */

import {
  WorkflowInboundCallsInterceptor,
  WorkflowExecuteInput,
  Next
} from '@temporalio/workflow';

import {
  ActivityInboundCallsInterceptor,
  ActivityExecuteInput,
  Context
} from '@temporalio/activity';

import {
  WorkerInterceptors,
  WorkflowInboundCallsInterceptorConstructor,
  ActivityInboundCallsInterceptorConstructor
} from '@temporalio/worker';

import {
  ClientInterceptors,
  WorkflowStartInterceptor,
  WorkflowSignalInterceptor,
  WorkflowQueryInterceptor,
  Headers
} from '@temporalio/client';

import {
  AuthenticationService,
  AuthorizationService,
  AuthToken,
  SecurityManager
} from './index';

// ============================================================================
// Security Context
// ============================================================================

export interface SecurityContext {
  token?: AuthToken;
  apiKey?: string;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  requestId?: string;
  sourceIp?: string;
}

// ============================================================================
// Audit Logger
// ============================================================================

export interface AuditLog {
  timestamp: Date;
  eventType: string;
  userId?: string;
  workflowId?: string;
  activityId?: string;
  action: string;
  result: 'success' | 'failure' | 'denied';
  metadata?: Record<string, any>;
  error?: string;
}

export class AuditLogger {
  private logs: AuditLog[] = [];
  private maxLogs = 10000;

  log(entry: AuditLog): void {
    this.logs.push(entry);
    
    // Prevent memory issues
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }
    
    // In production, this would send to a logging service
    console.log('[AUDIT]', JSON.stringify(entry));
  }

  getLogs(filter?: Partial<AuditLog>): AuditLog[] {
    if (!filter) return [...this.logs];
    
    return this.logs.filter(log => {
      for (const key in filter) {
        if (log[key as keyof AuditLog] !== filter[key as keyof AuditLog]) {
          return false;
        }
      }
      return true;
    });
  }

  clearLogs(): void {
    this.logs = [];
  }
}

// ============================================================================
// Workflow Security Interceptor
// ============================================================================

export class WorkflowSecurityInterceptor implements WorkflowInboundCallsInterceptor {
  private securityManager: SecurityManager;
  private auditLogger: AuditLogger;
  private context: SecurityContext;
  private workflowType: string;
  private workflowId: string;

  constructor(
    context: any,
    securityManager: SecurityManager,
    auditLogger: AuditLogger
  ) {
    this.securityManager = securityManager;
    this.auditLogger = auditLogger;
    this.workflowType = context.info.workflowType;
    this.workflowId = context.info.workflowId;
    this.context = this.extractSecurityContext(context.headers);
  }

  private extractSecurityContext(headers?: Headers): SecurityContext {
    if (!headers) return {};
    
    return {
      userId: headers.userId as string,
      roles: headers.roles ? JSON.parse(headers.roles as string) : [],
      permissions: headers.permissions ? JSON.parse(headers.permissions as string) : [],
      requestId: headers.requestId as string,
      sourceIp: headers.sourceIp as string
    };
  }

  async execute(
    input: WorkflowExecuteInput,
    next: Next<WorkflowInboundCallsInterceptor, 'execute'>
  ): Promise<unknown> {
    const startTime = Date.now();
    
    try {
      // Check workflow execution permission
      if (this.context.permissions && !this.context.permissions.includes('workflow:execute')) {
        this.auditLogger.log({
          timestamp: new Date(),
          eventType: 'workflow_execution',
          userId: this.context.userId,
          workflowId: this.workflowId,
          action: 'execute',
          result: 'denied',
          metadata: {
            workflowType: this.workflowType,
            missingPermission: 'workflow:execute'
          }
        });
        
        throw new Error('Unauthorized: Missing workflow:execute permission');
      }
      
      // Log successful authorization
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'workflow_execution',
        userId: this.context.userId,
        workflowId: this.workflowId,
        action: 'execute',
        result: 'success',
        metadata: {
          workflowType: this.workflowType,
          duration: Date.now() - startTime
        }
      });
      
      // Execute workflow
      return await next(input);
      
    } catch (error) {
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'workflow_execution',
        userId: this.context.userId,
        workflowId: this.workflowId,
        action: 'execute',
        result: 'failure',
        metadata: {
          workflowType: this.workflowType,
          duration: Date.now() - startTime
        },
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  async handleSignal(
    input: any,
    next: Next<WorkflowInboundCallsInterceptor, 'handleSignal'>
  ): Promise<void> {
    // Check signal permission
    if (this.context.permissions && !this.context.permissions.includes('workflow:signal')) {
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'workflow_signal',
        userId: this.context.userId,
        workflowId: this.workflowId,
        action: 'signal',
        result: 'denied',
        metadata: {
          signalName: input.signalName,
          missingPermission: 'workflow:signal'
        }
      });
      
      throw new Error('Unauthorized: Missing workflow:signal permission');
    }
    
    this.auditLogger.log({
      timestamp: new Date(),
      eventType: 'workflow_signal',
      userId: this.context.userId,
      workflowId: this.workflowId,
      action: 'signal',
      result: 'success',
      metadata: {
        signalName: input.signalName
      }
    });
    
    return await next(input);
  }

  async handleQuery(
    input: any,
    next: Next<WorkflowInboundCallsInterceptor, 'handleQuery'>
  ): Promise<unknown> {
    // Check query permission
    if (this.context.permissions && !this.context.permissions.includes('workflow:query')) {
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'workflow_query',
        userId: this.context.userId,
        workflowId: this.workflowId,
        action: 'query',
        result: 'denied',
        metadata: {
          queryName: input.queryName,
          missingPermission: 'workflow:query'
        }
      });
      
      throw new Error('Unauthorized: Missing workflow:query permission');
    }
    
    this.auditLogger.log({
      timestamp: new Date(),
      eventType: 'workflow_query',
      userId: this.context.userId,
      workflowId: this.workflowId,
      action: 'query',
      result: 'success',
      metadata: {
        queryName: input.queryName
      }
    });
    
    return await next(input);
  }
}

// ============================================================================
// Activity Security Interceptor
// ============================================================================

export class ActivitySecurityInterceptor implements ActivityInboundCallsInterceptor {
  private securityManager: SecurityManager;
  private auditLogger: AuditLogger;
  private context: SecurityContext;
  private activityType: string;
  private activityId: string;

  constructor(
    context: Context,
    securityManager: SecurityManager,
    auditLogger: AuditLogger
  ) {
    this.securityManager = securityManager;
    this.auditLogger = auditLogger;
    this.activityType = context.info.activityType;
    this.activityId = context.info.activityId;
    this.context = this.extractSecurityContext(context.headers);
  }

  private extractSecurityContext(headers?: any): SecurityContext {
    if (!headers) return {};
    
    return {
      userId: headers.userId,
      roles: headers.roles ? JSON.parse(headers.roles) : [],
      permissions: headers.permissions ? JSON.parse(headers.permissions) : [],
      requestId: headers.requestId,
      sourceIp: headers.sourceIp
    };
  }

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, 'execute'>
  ): Promise<unknown> {
    const startTime = Date.now();
    
    try {
      // Check activity execution permission
      if (this.context.permissions && !this.context.permissions.includes('activity:execute')) {
        this.auditLogger.log({
          timestamp: new Date(),
          eventType: 'activity_execution',
          userId: this.context.userId,
          activityId: this.activityId,
          action: 'execute',
          result: 'denied',
          metadata: {
            activityType: this.activityType,
            missingPermission: 'activity:execute'
          }
        });
        
        throw new Error('Unauthorized: Missing activity:execute permission');
      }
      
      // Log successful authorization
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'activity_execution',
        userId: this.context.userId,
        activityId: this.activityId,
        action: 'execute',
        result: 'success',
        metadata: {
          activityType: this.activityType
        }
      });
      
      // Execute activity
      const result = await next(input);
      
      // Log completion
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'activity_completion',
        userId: this.context.userId,
        activityId: this.activityId,
        action: 'complete',
        result: 'success',
        metadata: {
          activityType: this.activityType,
          duration: Date.now() - startTime
        }
      });
      
      return result;
      
    } catch (error) {
      this.auditLogger.log({
        timestamp: new Date(),
        eventType: 'activity_execution',
        userId: this.context.userId,
        activityId: this.activityId,
        action: 'execute',
        result: 'failure',
        metadata: {
          activityType: this.activityType,
          duration: Date.now() - startTime
        },
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
}

// ============================================================================
// Client Security Interceptor
// ============================================================================

export class ClientSecurityInterceptor {
  private securityManager: SecurityManager;
  private auditLogger: AuditLogger;
  private token?: AuthToken;

  constructor(
    securityManager: SecurityManager,
    auditLogger: AuditLogger,
    token?: string
  ) {
    this.securityManager = securityManager;
    this.auditLogger = auditLogger;
    
    if (token) {
      this.token = this.securityManager.getAuthenticationService().verifyToken(token);
      if (!this.token) {
        throw new Error('Invalid authentication token');
      }
    }
  }

  private addSecurityHeaders(headers: Headers = {}): Headers {
    if (!this.token) return headers;
    
    return {
      ...headers,
      userId: this.token.userId,
      roles: JSON.stringify(this.token.roles),
      permissions: JSON.stringify(this.token.permissions),
      requestId: crypto.randomUUID(),
      sourceIp: process.env.CLIENT_IP || 'unknown'
    };
  }

  createWorkflowStartInterceptor(): WorkflowStartInterceptor {
    return {
      start: async (input, next) => {
        // Check permission
        if (this.token && !this.securityManager.getAuthorizationService().hasPermission(this.token, 'workflow:create')) {
          this.auditLogger.log({
            timestamp: new Date(),
            eventType: 'workflow_start',
            userId: this.token.userId,
            workflowId: input.workflowId,
            action: 'start',
            result: 'denied',
            metadata: {
              workflowType: input.workflowType,
              missingPermission: 'workflow:create'
            }
          });
          
          throw new Error('Unauthorized: Missing workflow:create permission');
        }
        
        // Add security headers
        input.headers = this.addSecurityHeaders(input.headers);
        
        // Log the action
        this.auditLogger.log({
          timestamp: new Date(),
          eventType: 'workflow_start',
          userId: this.token?.userId,
          workflowId: input.workflowId,
          action: 'start',
          result: 'success',
          metadata: {
            workflowType: input.workflowType,
            taskQueue: input.taskQueue
          }
        });
        
        return await next(input);
      }
    };
  }

  createWorkflowSignalInterceptor(): WorkflowSignalInterceptor {
    return {
      signal: async (input, next) => {
        // Check permission
        if (this.token && !this.securityManager.getAuthorizationService().hasPermission(this.token, 'workflow:signal')) {
          this.auditLogger.log({
            timestamp: new Date(),
            eventType: 'workflow_signal',
            userId: this.token.userId,
            workflowId: input.workflowExecution.workflowId,
            action: 'signal',
            result: 'denied',
            metadata: {
              signalName: input.signalName,
              missingPermission: 'workflow:signal'
            }
          });
          
          throw new Error('Unauthorized: Missing workflow:signal permission');
        }
        
        // Add security headers
        input.headers = this.addSecurityHeaders(input.headers);
        
        // Log the action
        this.auditLogger.log({
          timestamp: new Date(),
          eventType: 'workflow_signal',
          userId: this.token?.userId,
          workflowId: input.workflowExecution.workflowId,
          action: 'signal',
          result: 'success',
          metadata: {
            signalName: input.signalName
          }
        });
        
        return await next(input);
      }
    };
  }

  getInterceptors(): ClientInterceptors {
    return {
      workflow: [
        this.createWorkflowStartInterceptor(),
        this.createWorkflowSignalInterceptor()
      ]
    };
  }
}

// ============================================================================
// Security Interceptor Factories
// ============================================================================

export function createSecurityInterceptors(
  securityManager: SecurityManager,
  auditLogger: AuditLogger
): WorkerInterceptors {
  const workflowInterceptorFactory: WorkflowInboundCallsInterceptorConstructor = (context) => {
    return new WorkflowSecurityInterceptor(context, securityManager, auditLogger);
  };
  
  const activityInterceptorFactory: ActivityInboundCallsInterceptorConstructor = (context) => {
    return new ActivitySecurityInterceptor(context, securityManager, auditLogger);
  };
  
  return {
    workflowModules: [{
      interceptors: workflowInterceptorFactory
    }],
    activityInbound: [activityInterceptorFactory]
  };
}

// ============================================================================
// Security Middleware for Express
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  user?: AuthToken;
  securityContext?: SecurityContext;
}

export function createAuthenticationMiddleware(securityManager: SecurityManager) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check for Bearer token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const authToken = securityManager.getAuthenticationService().verifyToken(token);
        
        if (authToken) {
          req.user = authToken;
          req.securityContext = {
            token: authToken,
            userId: authToken.userId,
            roles: authToken.roles,
            permissions: authToken.permissions,
            requestId: crypto.randomUUID(),
            sourceIp: req.ip
          };
        }
      }
      
      // Check for API key
      const apiKey = req.headers['x-api-key'] as string;
      const apiKeyId = req.headers['x-api-key-id'] as string;
      
      if (apiKey && apiKeyId) {
        if (securityManager.getAuthenticationService().verifyApiKey(apiKeyId, apiKey)) {
          req.securityContext = {
            apiKey,
            requestId: crypto.randomUUID(),
            sourceIp: req.ip
          };
        }
      }
      
      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

export function createAuthorizationMiddleware(requiredPermission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({ error: `Missing required permission: ${requiredPermission}` });
    }
    
    next();
  };
}

export function createRateLimitMiddleware(securityManager: SecurityManager) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const identifier = req.user?.userId || req.ip || 'unknown';
    
    if (!securityManager.getRateLimiter().isAllowed(identifier)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        remaining: securityManager.getRateLimiter().getRemaining(identifier)
      });
    }
    
    next();
  };
}

// ============================================================================
// Export
// ============================================================================

export {
  SecurityContext,
  AuditLog,
  AuditLogger,
  WorkflowSecurityInterceptor,
  ActivitySecurityInterceptor,
  ClientSecurityInterceptor,
  createSecurityInterceptors,
  AuthenticatedRequest
};

export default {
  AuditLogger,
  WorkflowSecurityInterceptor,
  ActivitySecurityInterceptor,
  ClientSecurityInterceptor,
  createSecurityInterceptors,
  createAuthenticationMiddleware,
  createAuthorizationMiddleware,
  createRateLimitMiddleware
};