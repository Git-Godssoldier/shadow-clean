import { ApiKeyProvider } from "@repo/types";

// Types for API key validation

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  latencyMs: number;
  validatedAt?: number;
}

export interface ValidationResults {
  individualVerification: boolean;
  [provider: string]: ValidationResult | boolean;
}

export function getValidationResult(
  results: ValidationResults,
  provider: ApiKeyProvider
): ValidationResult | undefined {
  const result = results[provider];
  if (typeof result === "object" && result !== null) {
    return result as ValidationResult;
  }
  return undefined;
}
