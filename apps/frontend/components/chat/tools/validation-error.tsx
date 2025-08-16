import type { ValidationErrorResult } from "@repo/types";
import { AlertTriangle } from "lucide-react";
import { ToolComponent } from "./tool";

export function ValidationErrorTool({
  toolName,
  args,
  error,
  toolCallId,
}: {
  toolName: string;
  args: Record<string, unknown>;
  error: ValidationErrorResult;
  toolCallId: string;
}) {
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

  return (
    <ToolComponent
      icon={<AlertTriangle />}
      type="warning"
      prefix="Validation Error"
      title={`(${toolName})`}
      collapsible
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium">{error.error}</div>
        {error.suggestedFix && (
          <div>
            <strong>Suggestion:</strong> {error.suggestedFix}
          </div>
        )}
        {error.validationDetails && (
          <div className="text-muted-foreground truncate">
            Expected: {error.validationDetails.expectedType}, Got:{" "}
            {error.validationDetails.receivedType}
          </div>
        )}
        <div>Tool Call ID: {toolCallId}</div>
        {!isProduction && Object.keys(args).length > 0 && (
          <details>
            <summary className="cursor-pointer">Tool Arguments</summary>
            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </ToolComponent>
  );
}
