/**
 * Security and Data Conversion System for Temporal.io Integration
 * Implements encryption, authentication, and custom data converters
 */

import {
  DataConverter,
  CompositeDataConverter,
  PayloadConverter,
  DefaultPayloadConverter,
  Payload,
  SearchAttributes,
  encodingKeys,
  defaultPayloadConverter
} from '@temporalio/common';

import {
  WorkflowOptions,
  Connection,
  ConnectionOptions
} from '@temporalio/client';

import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

// ============================================================================
// Encryption Configuration
// ============================================================================

export interface EncryptionConfig {
  algorithm: string;
  secretKey: string;
  ivLength: number;
  saltLength: number;
  tagLength: number;
  iterations: number;
}

export interface SecurityConfig {
  encryption: EncryptionConfig;
  authentication: {
    jwtSecret: string;
    jwtExpiry: string;
    apiKeys: Map<string, string>;
  };
  authorization: {
    roles: Map<string, string[]>;
    permissions: Map<string, string[]>;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

// ============================================================================
// Encryption Service
// ============================================================================

export class EncryptionService {
  private algorithm: string;
  private key: Buffer;
  private ivLength: number;
  private tagLength: number;
  private saltLength: number;
  private iterations: number;

  constructor(config: EncryptionConfig) {
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.ivLength = config.ivLength || 16;
    this.tagLength = config.tagLength || 16;
    this.saltLength = config.saltLength || 32;
    this.iterations = config.iterations || 100000;
    
    // Derive key from secret
    const salt = crypto.randomBytes(this.saltLength);
    this.key = crypto.pbkdf2Sync(
      config.secretKey,
      salt,
      this.iterations,
      32,
      'sha256'
    );
  }

  encrypt(data: Buffer): Buffer {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    
    const tag = (cipher as any).getAuthTag();
    
    // Combine iv + tag + encrypted data
    return Buffer.concat([iv, tag, encrypted]);
  }

  decrypt(data: Buffer): Buffer {
    const iv = data.slice(0, this.ivLength);
    const tag = data.slice(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = data.slice(this.ivLength + this.tagLength);
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    (decipher as any).setAuthTag(tag);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  compareHash(data: string, hash: string): boolean {
    return this.hash(data) === hash;
  }
}

// ============================================================================
// Encrypted Payload Converter
// ============================================================================

export class EncryptedPayloadConverter implements PayloadConverter {
  private encryptionService: EncryptionService;
  private innerConverter: PayloadConverter;

  constructor(encryptionService: EncryptionService) {
    this.encryptionService = encryptionService;
    this.innerConverter = new DefaultPayloadConverter();
  }

  get encodingType(): string {
    return 'encrypted/json';
  }

  toPayload(value: unknown): Payload | undefined {
    // First, convert to standard payload
    const innerPayload = this.innerConverter.toPayload(value);
    if (!innerPayload) return undefined;
    
    // Then encrypt the data
    const encrypted = this.encryptionService.encrypt(innerPayload.data!);
    
    return {
      metadata: {
        [encodingKeys.METADATA_ENCODING_KEY]: Buffer.from(this.encodingType),
        'encryption-key-id': Buffer.from('default'),
        'original-encoding': innerPayload.metadata?.[encodingKeys.METADATA_ENCODING_KEY] || Buffer.from('json/plain')
      },
      data: encrypted
    };
  }

  fromPayload<T>(payload: Payload): T {
    // Decrypt the data
    const decrypted = this.encryptionService.decrypt(payload.data!);
    
    // Restore original payload structure
    const originalPayload: Payload = {
      metadata: {
        [encodingKeys.METADATA_ENCODING_KEY]: payload.metadata?.['original-encoding'] || Buffer.from('json/plain')
      },
      data: decrypted
    };
    
    // Use inner converter to get the actual value
    return this.innerConverter.fromPayload(originalPayload);
  }
}

// ============================================================================
// Compressed Payload Converter
// ============================================================================

import * as zlib from 'zlib';

export class CompressedPayloadConverter implements PayloadConverter {
  private compressionLevel: number;
  private innerConverter: PayloadConverter;

  constructor(compressionLevel = 6) {
    this.compressionLevel = compressionLevel;
    this.innerConverter = new DefaultPayloadConverter();
  }

  get encodingType(): string {
    return 'compressed/gzip';
  }

  toPayload(value: unknown): Payload | undefined {
    const innerPayload = this.innerConverter.toPayload(value);
    if (!innerPayload) return undefined;
    
    // Compress the data
    const compressed = zlib.gzipSync(innerPayload.data!, {
      level: this.compressionLevel
    });
    
    return {
      metadata: {
        [encodingKeys.METADATA_ENCODING_KEY]: Buffer.from(this.encodingType),
        'original-encoding': innerPayload.metadata?.[encodingKeys.METADATA_ENCODING_KEY] || Buffer.from('json/plain'),
        'original-size': Buffer.from(String(innerPayload.data!.length))
      },
      data: compressed
    };
  }

  fromPayload<T>(payload: Payload): T {
    // Decompress the data
    const decompressed = zlib.gunzipSync(payload.data!);
    
    // Restore original payload
    const originalPayload: Payload = {
      metadata: {
        [encodingKeys.METADATA_ENCODING_KEY]: payload.metadata?.['original-encoding'] || Buffer.from('json/plain')
      },
      data: decompressed
    };
    
    return this.innerConverter.fromPayload(originalPayload);
  }
}

// ============================================================================
// Custom Data Converter
// ============================================================================

export class SecureDataConverter extends CompositeDataConverter {
  constructor(encryptionService?: EncryptionService, enableCompression = false) {
    const converters: PayloadConverter[] = [];
    
    // Add compression if enabled
    if (enableCompression) {
      converters.push(new CompressedPayloadConverter());
    }
    
    // Add encryption if service provided
    if (encryptionService) {
      converters.push(new EncryptedPayloadConverter(encryptionService));
    }
    
    // Add default converters
    converters.push(...defaultPayloadConverter.payloadConverters);
    
    super(...converters);
  }
}

// ============================================================================
// Authentication Service
// ============================================================================

export interface AuthToken {
  userId: string;
  roles: string[];
  permissions: string[];
  expiresAt: Date;
}

export class AuthenticationService {
  private jwtSecret: string;
  private jwtExpiry: string;
  private apiKeys: Map<string, string>;
  private encryptionService: EncryptionService;

  constructor(
    config: SecurityConfig['authentication'],
    encryptionService: EncryptionService
  ) {
    this.jwtSecret = config.jwtSecret;
    this.jwtExpiry = config.jwtExpiry || '24h';
    this.apiKeys = config.apiKeys || new Map();
    this.encryptionService = encryptionService;
  }

  generateToken(userId: string, roles: string[], permissions: string[]): string {
    const payload = {
      userId,
      roles,
      permissions,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry
    });
  }

  verifyToken(token: string): AuthToken | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      return {
        userId: decoded.userId,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        expiresAt: new Date(decoded.exp * 1000)
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  generateApiKey(identifier: string): string {
    const apiKey = this.encryptionService.generateApiKey();
    const hashedKey = this.encryptionService.hash(apiKey);
    
    this.apiKeys.set(identifier, hashedKey);
    
    return apiKey;
  }

  verifyApiKey(identifier: string, apiKey: string): boolean {
    const storedHash = this.apiKeys.get(identifier);
    if (!storedHash) return false;
    
    return this.encryptionService.compareHash(apiKey, storedHash);
  }

  revokeApiKey(identifier: string): void {
    this.apiKeys.delete(identifier);
  }
}

// ============================================================================
// Authorization Service
// ============================================================================

export class AuthorizationService {
  private roles: Map<string, string[]>;
  private permissions: Map<string, string[]>;

  constructor(config: SecurityConfig['authorization']) {
    this.roles = config.roles || new Map();
    this.permissions = config.permissions || new Map();
  }

  hasRole(token: AuthToken, requiredRole: string): boolean {
    return token.roles.includes(requiredRole);
  }

  hasPermission(token: AuthToken, requiredPermission: string): boolean {
    // Check direct permissions
    if (token.permissions.includes(requiredPermission)) {
      return true;
    }
    
    // Check role-based permissions
    for (const role of token.roles) {
      const rolePermissions = this.permissions.get(role) || [];
      if (rolePermissions.includes(requiredPermission)) {
        return true;
      }
    }
    
    return false;
  }

  hasAnyRole(token: AuthToken, requiredRoles: string[]): boolean {
    return requiredRoles.some(role => this.hasRole(token, role));
  }

  hasAllRoles(token: AuthToken, requiredRoles: string[]): boolean {
    return requiredRoles.every(role => this.hasRole(token, role));
  }

  hasAnyPermission(token: AuthToken, requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => this.hasPermission(token, permission));
  }

  hasAllPermissions(token: AuthToken, requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => this.hasPermission(token, permission));
  }

  addRole(roleName: string, permissions: string[]): void {
    this.permissions.set(roleName, permissions);
  }

  removeRole(roleName: string): void {
    this.permissions.delete(roleName);
  }

  getRolePermissions(roleName: string): string[] {
    return this.permissions.get(roleName) || [];
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(config: SecurityConfig['rateLimit']) {
    this.maxRequests = config.maxRequests || 100;
    this.windowMs = config.windowMs || 60000; // 1 minute default
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add new request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }

  resetAll(): void {
    this.requests.clear();
  }

  getRemaining(identifier: string): number {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    const validRequests = requests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
}

// ============================================================================
// Input Validation
// ============================================================================

export class InputValidator {
  private schemas: Map<string, z.ZodSchema> = new Map();

  registerSchema(name: string, schema: z.ZodSchema): void {
    this.schemas.set(name, schema);
  }

  validate<T>(schemaName: string, data: unknown): T {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaName}`);
    }
    
    return schema.parse(data) as T;
  }

  validateSafe<T>(schemaName: string, data: unknown): { success: boolean; data?: T; error?: string } {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      return { success: false, error: `Schema not found: ${schemaName}` };
    }
    
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data as T };
    } else {
      return { success: false, error: result.error.message };
    }
  }

  // Common validation schemas
  static readonly commonSchemas = {
    email: z.string().email(),
    uuid: z.string().uuid(),
    url: z.string().url(),
    date: z.string().datetime(),
    positiveNumber: z.number().positive(),
    nonEmptyString: z.string().min(1),
    alphanumeric: z.string().regex(/^[a-zA-Z0-9]+$/),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    strongPassword: z.string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain uppercase, lowercase, number, and special character')
  };
}

// ============================================================================
// Security Manager
// ============================================================================

export class SecurityManager {
  private encryptionService: EncryptionService;
  private authenticationService: AuthenticationService;
  private authorizationService: AuthorizationService;
  private rateLimiter: RateLimiter;
  private inputValidator: InputValidator;
  private dataConverter: SecureDataConverter;

  constructor(config: SecurityConfig) {
    this.encryptionService = new EncryptionService(config.encryption);
    this.authenticationService = new AuthenticationService(
      config.authentication,
      this.encryptionService
    );
    this.authorizationService = new AuthorizationService(config.authorization);
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.inputValidator = new InputValidator();
    this.dataConverter = new SecureDataConverter(this.encryptionService, true);
    
    this.setupDefaultRoles();
    this.setupDefaultSchemas();
  }

  private setupDefaultRoles(): void {
    // Admin role with all permissions
    this.authorizationService.addRole('admin', [
      'workflow:create',
      'workflow:read',
      'workflow:update',
      'workflow:delete',
      'workflow:signal',
      'workflow:query',
      'workflow:terminate',
      'activity:execute',
      'worker:manage',
      'system:configure'
    ]);
    
    // Operator role with operational permissions
    this.authorizationService.addRole('operator', [
      'workflow:create',
      'workflow:read',
      'workflow:signal',
      'workflow:query',
      'activity:execute',
      'worker:manage'
    ]);
    
    // Viewer role with read-only permissions
    this.authorizationService.addRole('viewer', [
      'workflow:read',
      'workflow:query'
    ]);
  }

  private setupDefaultSchemas(): void {
    // Workflow input validation
    this.inputValidator.registerSchema('workflowInput', z.object({
      workflowId: z.string().min(1),
      taskQueue: z.string().min(1),
      workflowType: z.string().min(1),
      input: z.any(),
      options: z.object({
        workflowExecutionTimeout: z.string().optional(),
        workflowRunTimeout: z.string().optional(),
        workflowTaskTimeout: z.string().optional(),
        retryPolicy: z.object({
          initialInterval: z.string().optional(),
          backoffCoefficient: z.number().optional(),
          maximumInterval: z.string().optional(),
          maximumAttempts: z.number().optional()
        }).optional()
      }).optional()
    }));
    
    // Activity input validation
    this.inputValidator.registerSchema('activityInput', z.object({
      activityType: z.string().min(1),
      input: z.any(),
      options: z.object({
        startToCloseTimeout: z.string().optional(),
        scheduleToCloseTimeout: z.string().optional(),
        heartbeatTimeout: z.string().optional(),
        retryPolicy: z.object({
          initialInterval: z.string().optional(),
          backoffCoefficient: z.number().optional(),
          maximumInterval: z.string().optional(),
          maximumAttempts: z.number().optional()
        }).optional()
      }).optional()
    }));
  }

  // Public API
  getEncryptionService(): EncryptionService {
    return this.encryptionService;
  }

  getAuthenticationService(): AuthenticationService {
    return this.authenticationService;
  }

  getAuthorizationService(): AuthorizationService {
    return this.authorizationService;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  getInputValidator(): InputValidator {
    return this.inputValidator;
  }

  getDataConverter(): SecureDataConverter {
    return this.dataConverter;
  }

  // Convenience methods
  async createSecureConnection(options: ConnectionOptions): Promise<Connection> {
    return await Connection.connect({
      ...options,
      dataConverter: this.dataConverter
    });
  }

  validateAndAuthorize<T>(
    token: AuthToken,
    requiredPermission: string,
    schemaName: string,
    data: unknown
  ): T {
    // Check authorization
    if (!this.authorizationService.hasPermission(token, requiredPermission)) {
      throw new Error(`Unauthorized: Missing permission ${requiredPermission}`);
    }
    
    // Validate input
    return this.inputValidator.validate<T>(schemaName, data);
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  EncryptionService,
  EncryptedPayloadConverter,
  CompressedPayloadConverter,
  SecureDataConverter,
  AuthenticationService,
  AuthorizationService,
  RateLimiter,
  InputValidator,
  SecurityManager
};

export default SecurityManager;