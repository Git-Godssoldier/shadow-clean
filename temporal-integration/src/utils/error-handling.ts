/**
 * Comprehensive Error Handling and Retry Policies for Temporal.io Integration
 */

import { ApplicationFailure, TimeoutFailure, ActivityFailure } from '@temporalio/common';
import { RetryPolicy } from '@temporalio/client';
import {
  TemporalError,
  ValidationError,
  TimeoutError,
  RetryExhaustedError
} from '../types';

// ============================================================================
// Error Classification
// ============================================================================

export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  RESOURCE = 'resource',
  BUSINESS = 'business',
  SYSTEM = 'system',
  TIMEOUT = 'timeout',
  CANCELLATION = 'cancellation'
}

export interface ErrorMetadata {
  category: ErrorCategory;
  retryable: boolean;
  retryDelay?: string;
  maxAttempts?: number;
  exponentialBackoff?: boolean;
  context?: Record<string, unknown>;
}

// ============================================================================
// Error Matchers and Classifiers
// ============================================================================

export const ErrorPatterns = {
  VALIDATION: [
    /invalid.*input/i,
    /missing.*required/i,
    /validation.*failed/i,
    /schema.*error/i,
    /malformed.*request/i
  ],
  NETWORK: [
    /connection.*refused/i,
    /network.*error/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ECONNRESET/i
  ],
  AUTHENTICATION: [
    /unauthorized/i,
    /authentication.*failed/i,
    /invalid.*credentials/i,
    /token.*expired/i,
    /401/
  ],
  AUTHORIZATION: [
    /forbidden/i,
    /access.*denied/i,
    /insufficient.*permissions/i,
    /403/
  ],
  RATE_LIMIT: [
    /rate.*limit/i,
    /too.*many.*requests/i,
    /429/,
    /quota.*exceeded/i
  ],
  RESOURCE: [
    /out.*of.*memory/i,
    /disk.*full/i,
    /resource.*exhausted/i,
    /503/,
    /507/
  ],
  BUSINESS: [
    /business.*rule/i,
    /constraint.*violation/i,
    /duplicate.*key/i,
    /conflict/i,
    /409/
  ]
};

export function classifyError(error: Error | string): ErrorMetadata {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;

  // Check each category
  for (const [category, patterns] of Object.entries(ErrorPatterns)) {
    if (patterns.some(pattern => pattern.test(message))) {
      return getErrorMetadata(category as keyof typeof ErrorPatterns, message, stack);
    }
  }

  // Default to system error
  return {
    category: ErrorCategory.SYSTEM,
    retryable: true,
    maxAttempts: 3,
    exponentialBackoff: true,
    context: { message, stack }
  };
}

function getErrorMetadata(
  category: keyof typeof ErrorPatterns,
  message: string,
  stack?: string
): ErrorMetadata {
  const baseContext = { message, stack };

  switch (category) {
    case 'VALIDATION':
      return {
        category: ErrorCategory.VALIDATION,
        retryable: false,
        context: baseContext
      };

    case 'NETWORK':
      return {
        category: ErrorCategory.NETWORK,
        retryable: true,
        retryDelay: '2s',
        maxAttempts: 5,
        exponentialBackoff: true,
        context: baseContext
      };

    case 'AUTHENTICATION':
      return {
        category: ErrorCategory.AUTHENTICATION,
        retryable: false,
        context: baseContext
      };

    case 'AUTHORIZATION':
      return {
        category: ErrorCategory.AUTHORIZATION,
        retryable: false,
        context: baseContext
      };

    case 'RATE_LIMIT':
      return {
        category: ErrorCategory.RATE_LIMIT,
        retryable: true,
        retryDelay: '30s',
        maxAttempts: 10,
        exponentialBackoff: true,
        context: baseContext
      };

    case 'RESOURCE':
      return {
        category: ErrorCategory.RESOURCE,
        retryable: true,
        retryDelay: '5s',
        maxAttempts: 3,
        exponentialBackoff: true,
        context: baseContext
      };

    case 'BUSINESS':
      return {
        category: ErrorCategory.BUSINESS,
        retryable: false,
        context: baseContext
      };

    default:
      return {
        category: ErrorCategory.SYSTEM,
        retryable: true,
        maxAttempts: 3,
        exponentialBackoff: true,
        context: baseContext
      };
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export class ErrorFactory {
  static createValidationError(
    message: string,
    field?: string,
    value?: unknown
  ): ApplicationFailure {
    return ApplicationFailure.nonRetryable(
      message,
      'ValidationError',
      { field, value, timestamp: new Date().toISOString() }
    );
  }

  static createNetworkError(
    message: string,
    endpoint?: string,
    statusCode?: number
  ): ApplicationFailure {
    return ApplicationFailure.create({
      message,
      type: 'NetworkError',
      nonRetryable: false,
      nextRetryDelay: '2s',
      details: [{ endpoint, statusCode, timestamp: new Date().toISOString() }]
    });
  }

  static createRateLimitError(
    message: string,
    retryAfter?: number
  ): ApplicationFailure {
    const delay = retryAfter ? `${retryAfter}s` : '30s';
    return ApplicationFailure.create({
      message,
      type: 'RateLimitError',
      nonRetryable: false,
      nextRetryDelay: delay,
      details: [{ retryAfter, timestamp: new Date().toISOString() }]
    });
  }

  static createTimeoutError(
    message: string,
    timeoutMs: number,
    operation?: string
  ): ApplicationFailure {
    return ApplicationFailure.create({
      message,
      type: 'TimeoutError',
      nonRetryable: false,
      nextRetryDelay: '5s',
      details: [{ timeoutMs, operation, timestamp: new Date().toISOString() }]
    });
  }

  static createBusinessError(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ): ApplicationFailure {
    return ApplicationFailure.nonRetryable(
      message,
      'BusinessError',
      { code, ...details, timestamp: new Date().toISOString() }
    );
  }

  static createAuthenticationError(
    message: string,
    reason?: string
  ): ApplicationFailure {
    return ApplicationFailure.nonRetryable(
      message,
      'AuthenticationError',
      { reason, timestamp: new Date().toISOString() }
    );
  }

  static createAuthorizationError(
    message: string,
    requiredPermission?: string,
    userRole?: string
  ): ApplicationFailure {
    return ApplicationFailure.nonRetryable(
      message,
      'AuthorizationError',
      { requiredPermission, userRole, timestamp: new Date().toISOString() }
    );
  }
}

// ============================================================================
// Retry Policy Presets
// ============================================================================

export const RetryPolicies = {
  /**
   * Conservative retry policy for critical operations
   */
  CRITICAL: {
    initialInterval: '1s',
    backoffCoefficient: 1.5,
    maximumInterval: '30s',
    maximumAttempts: 10,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * Standard retry policy for most operations
   */
  STANDARD: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '1m',
    maximumAttempts: 5,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * Aggressive retry policy for unreliable external services
   */
  AGGRESSIVE: {
    initialInterval: '500ms',
    backoffCoefficient: 2,
    maximumInterval: '2m',
    maximumAttempts: 15,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * Fast retry policy for lightweight operations
   */
  FAST: {
    initialInterval: '100ms',
    backoffCoefficient: 1.5,
    maximumInterval: '5s',
    maximumAttempts: 3,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * Network-specific retry policy
   */
  NETWORK: {
    initialInterval: '2s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
    maximumAttempts: 8,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * Rate limit aware retry policy
   */
  RATE_LIMITED: {
    initialInterval: '10s',
    backoffCoefficient: 3,
    maximumInterval: '5m',
    maximumAttempts: 20,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'BusinessError'
    ]
  } as RetryPolicy,

  /**
   * No retry policy for operations that should not be retried
   */
  NO_RETRY: {
    maximumAttempts: 1
  } as RetryPolicy
};

// ============================================================================
// Error Handling Utilities
// ============================================================================

export class ErrorHandler {
  /**
   * Wraps an error with appropriate Temporal error type based on classification
   */
  static wrapError(error: Error | string, context?: Record<string, unknown>): ApplicationFailure {
    const metadata = classifyError(error);
    const message = typeof error === 'string' ? error : error.message;
    
    if (!metadata.retryable) {
      return ApplicationFailure.nonRetryable(
        message,
        metadata.category,
        { ...metadata.context, ...context }
      );
    }

    return ApplicationFailure.create({
      message,
      type: metadata.category,
      nonRetryable: false,
      nextRetryDelay: metadata.retryDelay,
      details: [{ ...metadata.context, ...context }]
    });
  }

  /**
   * Creates a retry policy based on error category
   */
  static getRetryPolicyForError(error: Error | string): RetryPolicy {
    const metadata = classifyError(error);

    switch (metadata.category) {
      case ErrorCategory.NETWORK:
        return RetryPolicies.NETWORK;
      case ErrorCategory.RATE_LIMIT:
        return RetryPolicies.RATE_LIMITED;
      case ErrorCategory.RESOURCE:
        return RetryPolicies.AGGRESSIVE;
      case ErrorCategory.VALIDATION:
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.BUSINESS:
        return RetryPolicies.NO_RETRY;
      default:
        return RetryPolicies.STANDARD;
    }
  }

  /**
   * Extracts meaningful error information from various error types
   */
  static extractErrorInfo(error: unknown): {
    message: string;
    type: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  } {
    if (error instanceof ApplicationFailure) {
      return {
        message: error.message,
        type: error.type || 'ApplicationFailure',
        retryable: !error.nonRetryable,
        details: Array.isArray(error.details) ? 
          (error.details[0] as Record<string, unknown>) : 
          (error.details as Record<string, unknown> || {})
      };
    }

    if (error instanceof ActivityFailure) {
      return {
        message: error.message,
        type: 'ActivityFailure',
        retryable: true,
        details: {
          activityId: error.activityId,
          activityType: error.activityType
        }
      };
    }

    if (error instanceof TimeoutFailure) {
      return {
        message: error.message,
        type: 'TimeoutFailure',
        retryable: true,
        details: {
          timeoutType: error.timeoutType
        }
      };
    }

    if (error instanceof Error) {
      const metadata = classifyError(error);
      return {
        message: error.message,
        type: error.constructor.name,
        retryable: metadata.retryable,
        details: {
          stack: error.stack,
          category: metadata.category
        }
      };
    }

    return {
      message: String(error),
      type: 'UnknownError',
      retryable: true,
      details: { originalError: error }
    };
  }

  /**
   * Logs error with appropriate level and context
   */
  static logError(
    error: unknown,
    context: {
      operation: string;
      workflowId?: string;
      activityId?: string;
      attemptNumber?: number;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const errorInfo = this.extractErrorInfo(error);
    const logContext = {
      ...context,
      error: {
        message: errorInfo.message,
        type: errorInfo.type,
        retryable: errorInfo.retryable,
        details: errorInfo.details
      },
      timestamp: new Date().toISOString()
    };

    if (errorInfo.retryable) {
      console.warn('Retryable error occurred:', logContext);
    } else {
      console.error('Non-retryable error occurred:', logContext);
    }
  }
}

// ============================================================================
// Circuit Breaker Pattern
// ============================================================================

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw ErrorFactory.createBusinessError(
          'Circuit breaker is open',
          'CIRCUIT_BREAKER_OPEN',
          {
            failures: this.failures,
            lastFailureTime: this.lastFailureTime,
            timeUntilReset: this.resetTimeout - (Date.now() - this.lastFailureTime)
          }
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
  }
}

// ============================================================================
// Compensation Pattern (Saga)
// ============================================================================

export interface CompensationAction {
  name: string;
  action: () => Promise<void>;
  critical?: boolean;
}

export class SagaManager {
  private compensations: CompensationAction[] = [];

  addCompensation(compensation: CompensationAction): void {
    this.compensations.push(compensation);
  }

  async executeCompensations(): Promise<void> {
    // Execute compensations in reverse order
    const reversedCompensations = [...this.compensations].reverse();
    const errors: Array<{ name: string; error: Error }> = [];

    for (const compensation of reversedCompensations) {
      try {
        console.log(`Executing compensation: ${compensation.name}`);
        await compensation.action();
        console.log(`Compensation completed: ${compensation.name}`);
      } catch (error) {
        const errorInfo = {
          name: compensation.name,
          error: error instanceof Error ? error : new Error(String(error))
        };
        errors.push(errorInfo);

        console.error(`Compensation failed: ${compensation.name}`, error);

        // If it's a critical compensation, stop executing further compensations
        if (compensation.critical) {
          console.error('Critical compensation failed, stopping saga rollback');
          break;
        }
      }
    }

    if (errors.length > 0) {
      throw ErrorFactory.createBusinessError(
        `Saga compensation failed: ${errors.length} out of ${this.compensations.length} compensations failed`,
        'SAGA_COMPENSATION_FAILED',
        { errors: errors.map(e => ({ name: e.name, message: e.error.message })) }
      );
    }
  }

  clear(): void {
    this.compensations = [];
  }

  getCompensationCount(): number {
    return this.compensations.length;
  }
}