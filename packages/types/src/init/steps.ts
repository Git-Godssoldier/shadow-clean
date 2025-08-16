import type { InitStatus } from "@repo/db";

/**
 * Human-readable display names for initialization steps
 */
export const STEP_DISPLAY_NAMES: Record<InitStatus, string> = {
  INACTIVE: "Inactive",
  PREPARE_WORKSPACE: "Preparing Workspace",
  CREATE_VM: "Creating VM",
  WAIT_VM_READY: "Starting VM",
  VERIFY_VM_WORKSPACE: "Verifying Workspace",
  START_BACKGROUND_SERVICES: "Starting Background Services",
  INSTALL_DEPENDENCIES: "Installing Dependencies",
  COMPLETE_SHADOW_WIKI: "Complete Opulent OS Wiki",
  ACTIVE: "Active",
};

/**
 * Get the display name for a step based on user settings
 */
export function getStepDisplayName(
  step: InitStatus,
  userSettings?: { enableShadowWiki?: boolean }
): string {
  if (step === "COMPLETE_SHADOW_WIKI" && userSettings?.enableShadowWiki === false) {
    return "Completing Setup";
  }
  return STEP_DISPLAY_NAMES[step] || "Unknown Step";
}

/**
 * Get all step display names in execution order for a given mode
 */
export function getStepsForMode(mode: "local" | "remote"): InitStatus[] {
  const steps: InitStatus[] = [];
  // Background services are enabled by default and run in parallel

  if (mode === "remote") {
    steps.push(
      "CREATE_VM",
      "WAIT_VM_READY",
      "VERIFY_VM_WORKSPACE",
      "START_BACKGROUND_SERVICES",
      "INSTALL_DEPENDENCIES",
      "COMPLETE_SHADOW_WIKI"
    );
  } else {
    steps.push(
      "PREPARE_WORKSPACE",
      "START_BACKGROUND_SERVICES",
      "INSTALL_DEPENDENCIES",
      "COMPLETE_SHADOW_WIKI"
    );
  }

  return steps;
}
