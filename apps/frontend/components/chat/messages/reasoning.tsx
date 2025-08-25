import { ToolTypes, type ReasoningPart } from "@repo/types";
import { ChevronDown } from "lucide-react";
import { ToolComponent } from "../tools/tool";
import { FadedMarkdown } from "../markdown/memoized-markdown";

export function ReasoningComponent({
  part,
  isLoading = false,
  forceOpen = false,
}: {
  part: ReasoningPart;
  isLoading?: boolean;
  forceOpen?: boolean;
}) {
  const trimmedPart = part.text.trim();

  return (
    <ToolComponent
      icon={<ChevronDown />}
      collapsible
      forceOpen={forceOpen}
      isLoading={isLoading}
      type={ToolTypes.REASONING}
    >
      <FadedMarkdown content={trimmedPart} id={JSON.stringify(part)} />
    </ToolComponent>
  );
}

export function RedactedReasoningComponent() {
  return (
    <ToolComponent collapsible type={ToolTypes.REDACTED_REASONING}>
      <div className="text-muted-foreground whitespace-pre-wrap pb-1 text-sm">
        Reasoning content has been redacted by Anthropic.
      </div>
    </ToolComponent>
  );
}
