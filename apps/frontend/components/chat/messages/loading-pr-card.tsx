import { Card } from "@/components/ui/card";
import { Circle, File } from "lucide-react";
import Image from "next/image";

export function LoadingPRCard() {
  return (
    <>
      <Card className="hover:bg-card/70 mt-4 animate-pulse gap-1 rounded-lg p-3 text-left">
        <div className="flex h-6 items-center gap-2 overflow-hidden font-medium">
          <Image src="/github.svg" alt="GitHub" width={16} height={16} />
          <div className="bg-border h-4 w-full max-w-48 rounded"></div>
        </div>

        <div className="text-muted-foreground flex h-5 items-center gap-2 text-[13px]">
          <div className="bg-border h-3 w-8 rounded"></div>

          <Circle className="fill-muted-foreground size-1 opacity-50" />

          <div className="flex items-center gap-1">
            <div className="h-3 w-6 rounded bg-green-400/30"></div>
            <div className="bg-destructive/30 h-3 w-6 rounded"></div>
          </div>

          <Circle className="fill-muted-foreground size-1 opacity-50" />

          <div className="flex items-center gap-1">
            <File className="size-3" />
            <div className="bg-border h-3 w-10 rounded"></div>
          </div>

          <Circle className="fill-muted-foreground size-1 opacity-50" />

          <div className="bg-border h-3 w-12 rounded"></div>
        </div>
      </Card>
    </>
  );
}
