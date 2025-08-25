import { NodeSDK } from "@opentelemetry/sdk-node";
import { BraintrustSpanProcessor } from "braintrust";
import config from "./config";

let sdk: NodeSDK | null = null;

export function initializeTelemetry() {
  if (sdk) {
    console.log("[TELEMETRY] SDK already initialized");
    return;
  }

  if (
    !config.enableBraintrust ||
    !config.braintrustApiKey ||
    !config.braintrustProjectId
  ) {
    console.log("[TELEMETRY] Braintrust disabled - missing configuration");
    return;
  }

  try {
    sdk = new NodeSDK({
      spanProcessors: [
        new BraintrustSpanProcessor({
          parent: `project_id:${config.braintrustProjectId}`,
          filterAISpans: true,
        }),
      ],
    });

    sdk.start();
    console.log(
      "[TELEMETRY] Braintrust observability initialized successfully"
    );
  } catch (error) {
    console.error("[TELEMETRY] Failed to initialize Braintrust:", error);
  }
}

export function shutdownTelemetry() {
  if (sdk) {
    return sdk.shutdown();
  }
}
