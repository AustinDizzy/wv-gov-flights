import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AgencyOption {
  department: string;
  divisions: string[];
}

interface PassengerAgencyFilterProps {
  action: string;
  agencyOptions: AgencyOption[];
  selectedDepartment?: string;
  selectedDivision?: string;
  search?: string;
  sort?: string;
}

export default function PassengerAgencyFilter({
  action,
  agencyOptions,
  selectedDepartment = "",
  selectedDivision = "",
  search = "",
  sort,
}: PassengerAgencyFilterProps) {
  const selectedLabel = selectedDivision || selectedDepartment || "All agencies";

  const selectAgency = (type?: "department" | "division", value?: string) => {
    const destination = new URL(action, window.location.href);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type && value) params.set(type, value);
    if (sort) params.set("sort", sort);
    destination.search = params.toString();
    window.location.assign(destination.toString());
  };

  const choice = (
    label: string,
    selected: boolean,
    onSelect: () => void,
    nested = false,
  ) => (
    <Button
      type="button"
      variant="ghost"
      role="radio"
      aria-checked={selected}
      className={`h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left font-normal${nested ? " pl-7" : ""}`}
      onClick={onSelect}
    >
      <Check className={selected ? "" : "opacity-0"} aria-hidden="true" />
      <span className="min-w-0">{label}</span>
    </Button>
  );

  return (
    <Field className="min-w-0">
      <FieldLabel>Agency</FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-[2.6rem] w-full min-w-0 justify-between font-normal"
            aria-label="Filter passengers by agency"
          >
            <span className="truncate" title={selectedLabel}>{selectedLabel}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="max-h-96 w-[min(24rem,calc(100vw-2rem))] gap-1 overflow-y-auto p-2"
          align="start"
        >
          <div role="radiogroup" aria-label="Passenger agency options">
            {choice(
              "All agencies",
              !selectedDepartment && !selectedDivision,
              () => selectAgency(),
            )}
            <div className="my-1 border-t" />
            <div className="grid gap-1">
              {agencyOptions.map((agency) => (
                <div key={agency.department} className="[&+&]:mt-1 [&+&]:border-t [&+&]:pt-1">
                  {choice(
                    agency.department,
                    selectedDepartment === agency.department,
                    () => selectAgency("department", agency.department),
                  )}
                  {agency.divisions.length > 0 && (
                    <div className="ml-[1.15rem] grid gap-[.1rem] border-l border-border pl-[.55rem]">
                      {agency.divisions.map((division) => (
                        <div key={`${agency.department}:${division}`}>
                          {choice(
                            division,
                            selectedDivision === division,
                            () => selectAgency("division", division),
                            true,
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
