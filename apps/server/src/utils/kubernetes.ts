/**
 * Sanitize task ID for use in Kubernetes resource names and DNS hostnames
 * Kubernetes requires DNS-1123 compliant names:
 * - Lowercase alphanumeric characters and hyphens only
 * - Cannot start or end with hyphens
 * - Maximum length 63 characters
 */
export function sanitizeTaskIdForK8s(taskId: string): string {
  return taskId
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9-]/g, "-") // Replace invalid chars with hyphens
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .substring(0, 63); // Ensure max length (DNS limit)
}
