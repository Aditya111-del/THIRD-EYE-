import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  direction,
  ...props
}: React.ComponentProps<typeof Group> & { direction?: "horizontal" | "vertical" }) => (
  <Group
    orientation={direction || orientation}
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

function normalizeSize(val: number | string | undefined): number | string | undefined {
  if (typeof val === "number" && val > 0 && val <= 100) {
    return `${val}%`;
  }
  return val;
}

const ResizablePanel = ({
  defaultSize,
  minSize,
  maxSize,
  className,
  ...props
}: React.ComponentProps<typeof Panel>) => (
  <Panel
    defaultSize={normalizeSize(defaultSize)}
    minSize={normalizeSize(minSize)}
    maxSize={normalizeSize(maxSize)}
    className={cn("min-w-0 overflow-hidden", className)}
    {...props}
  />
);

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-[#262626] hover:bg-[#FF6B00]/60 transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 outline-none data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-[#303030] bg-[#181818]">
        <GripVertical className="h-2.5 w-2.5 text-[#808080]" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
