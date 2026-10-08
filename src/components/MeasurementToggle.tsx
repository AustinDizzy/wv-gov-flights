import * as React from "react";
import {
  formatDecimalFlightHours,
  formatFlightHoursDuration,
  formatKilometersFromNauticalMiles,
  formatNauticalMiles,
} from "../lib/measurements";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface MeasurementToggleProps {
  kind: "flight-hours" | "distance";
  value: number;
  compact?: boolean;
  labelElement?: "span" | "dt";
  valueElement?: "span" | "strong" | "dd";
  labels?: {
    primary: string;
    secondary: string;
  };
}

export default function MeasurementToggle({
  kind,
  value,
  compact = false,
  labelElement = "span",
  valueElement = "span",
  labels,
}: MeasurementToggleProps) {
  const [showSecondary, setShowSecondary] = React.useState(false);
  const primary =
    kind === "flight-hours"
      ? formatDecimalFlightHours(value, { includeUnit: !compact, compact })
      : formatNauticalMiles(value, { compact });
  const secondary =
    kind === "flight-hours"
      ? formatFlightHoursDuration(value, { compact })
      : formatKilometersFromNauticalMiles(value, { compact });
  const currentValue = showSecondary ? secondary : primary;
  const alternateValue = showSecondary ? primary : secondary;

  const toggle = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="m-0 inline w-auto min-w-0 cursor-pointer rounded-none border-0 border-b border-dotted border-current bg-transparent p-0 text-inherit [font:inherit] [font-weight:inherit] leading-[inherit] [text-align:inherit] hover:border-solid focus-visible:outline-offset-3"
            aria-label={`${currentValue}; toggle to ${alternateValue}`}
            aria-pressed={showSecondary}
            onClick={() => setShowSecondary((current) => !current)}
          >
            {currentValue}
          </button>
        </TooltipTrigger>
        <TooltipContent>{alternateValue}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (!labels) return toggle;

  const LabelElement = labelElement;
  const ValueElement = valueElement;
  return (
    <>
      <LabelElement className={compact ? "block text-[.6rem] font-[750] tracking-[.06em] text-muted-foreground uppercase" : "block text-[.65rem] font-bold text-muted-foreground"}>
        {showSecondary ? labels.secondary : labels.primary}
      </LabelElement>
      <ValueElement className={compact ? "mt-[.1rem] block text-[1.05rem] leading-[1.2] font-[850] tracking-normal text-foreground normal-case" : "mt-[.2rem] block text-[.9rem] font-[720]"}>{toggle}</ValueElement>
    </>
  );
}
