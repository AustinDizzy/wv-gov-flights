import React from "react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Aircraft } from "@/types";

export function AircraftTooltip({ aircraft, variant }: {
    aircraft: Aircraft;
    variant?: "table" | "title";
}) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger className="flex-inline items-center whitespace-nowrap">
                    <Badge variant={aircraft.type === "airplane" ? "secondary" : "default"}
                    className={"" + (variant == 'title' ? "text-lg" : "text-sm")}>
                        {aircraft.tail_no} {aircraft.type === "airplane" ? "✈️" : "🚁"}
                    </Badge>
                </TooltipTrigger>
                <TooltipContent className={aircraft.type === "airplane" ? "bg-secondary" : "bg-primary"}>
                    <div className={variant == 'title' ? "text-lg" : "text-sm"}>
                        <span className="col-span-2">{aircraft.name}</span>
                        <span className="text-xs grid grid-cols-2 gap-1">
                            <span>
                                {aircraft.type}
                            </span>
                            <span>
                                ${aircraft.rate.toLocaleString()} per hr.
                            </span>
                        </span>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};