import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatDuration, cn } from "@/lib/utils";

export function DurationTooltip({ duration, variant = "short", className }: { 
    duration: number;
    variant?: "short" | "long" | "full";
    className?: string;
}) {
    const [
        short_long,
        full
    ] = [
        [duration.toLocaleString(), variant === "short" ? " hrs" : "flight hours"].join(" "),
        formatDuration(duration).replace("h", "h ").replace("m", "m ")
    ]
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger className={cn("flex-inline whitespace-nowrap border-b border-dotted", className)}>
                {variant === "full" ? full : short_long}
                </TooltipTrigger>
                <TooltipContent>
                {variant === "full" ? short_long : full.replace("h ", " hours ").replace("m ", " minutes")}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}