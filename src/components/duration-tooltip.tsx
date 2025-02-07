import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatDuration, cn } from "@/lib/utils";

export function DurationTooltip({ duration, variant = "short", className }: { 
    duration: number;
    variant?: "short" | "long";
    className?: string;
}) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger className={cn("flex-inline whitespace-nowrap border-b border-dotted", className)}>
                {duration.toLocaleString()} {variant === "short" ? " hrs" : "flight hours"}
                </TooltipTrigger>
                <TooltipContent>
                {formatDuration(duration).replace("~", "approx. ").replace("h", " hours ").replace("m", " minutes")}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}