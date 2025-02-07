import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { calcDistance, cn } from "@/lib/utils";

export function DistanceTooltip({ paths, variant = "short", className }: { 
    paths: string[];
    variant?: "short" | "long";
    className?: string;
}) {
    const [nmi, km] = [
        Number(calcDistance(paths).toFixed(1)),
        Number(calcDistance(paths, "kilometers").toFixed(1))
    ]
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger className={cn("flex-inline whitespace-nowrap border-b border-dotted", className)}>
                {nmi.toLocaleString()}{" "}{variant === "short" ? "nmi" : "nautical miles"}
                </TooltipTrigger>
                <TooltipContent>
                {km.toLocaleString()}{" "}{variant === "short" ? "km" : "kilometers"}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}