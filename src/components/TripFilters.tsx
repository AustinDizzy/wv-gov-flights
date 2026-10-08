import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { CalendarDays, Check, ChevronDown, Search, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  label: string;
  value: string;
}

interface AgencyOption {
  department: string;
  divisions: string[];
}

interface FilterValues {
  search: string;
  aircraft: string[];
  departments: string[];
  divisions: string[];
  dateRange?: DateRange;
}

type PanelKey = "aircraft" | "agency" | "date";

interface TripFiltersProps {
  action: string;
  initialSearch: string;
  aircraftOptions?: Option[];
  agencyOptions: AgencyOption[];
  selectedAircraft: string[];
  selectedDepartments: string[];
  selectedDivisions: string[];
  datasetMinDate?: string;
  datasetMaxDate?: string;
  startDate?: string;
  endDate?: string;
  initialSort?: string;
}

function AgencyMultiSelect({
  options,
  departments,
  divisions,
  open,
  onOpenChange,
  onApply,
}: {
  options: AgencyOption[];
  departments: string[];
  divisions: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (values: { departments: string[]; divisions: string[] }) => void;
}) {
  const [draftDepartments, setDraftDepartments] = useState(departments);
  const [draftDivisions, setDraftDivisions] = useState(divisions);
  const panelId = useId();
  const selectedDepartments = new Set(draftDepartments);
  const selectedDivisions = new Set(draftDivisions);
  const selectionLabel = [...departments, ...divisions].join(", ");

  const toggleDepartment = (value: string, checked: boolean) => {
    const next = new Set(selectedDepartments);
    if (checked) next.add(value);
    else next.delete(value);
    setDraftDepartments([...next]);
  };

  const toggleDivision = (value: string, checked: boolean) => {
    const next = new Set(selectedDivisions);
    if (checked) next.add(value);
    else next.delete(value);
    setDraftDivisions([...next]);
  };

  return (
    <Field className="m-0 min-w-0 border-0 p-0">
      <FieldLabel>Agency</FieldLabel>
      <div className="relative min-w-0" data-filter-dropdown data-filter-key="agency">
        <Button
          className="w-full min-w-0 justify-between"
          type="button"
          variant="outline"
          aria-label="Filter by agency"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (!open) {
              setDraftDepartments(departments);
              setDraftDivisions(divisions);
            }
            onOpenChange(!open);
          }}
        >
          <span className="truncate" title={selectionLabel || undefined}>
            {selectionLabel || "All agencies"}
          </span>
          <ChevronDown className={open ? "rotate-180" : ""} aria-hidden="true" />
        </Button>
        {open && (
          <div
            id={panelId}
            role="dialog"
            aria-label="Agency options"
            className="absolute top-[calc(100%+.3rem)] left-0 z-40 grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-lg border border-border bg-surface p-3 text-foreground shadow-[0_14px_30px_rgb(2_12_27_/_22%)]"
          >
            <div className="max-h-80 overflow-y-auto pr-1">
              <div className="grid gap-2">
                {options.map((option) => {
                  const departmentId = `trip-filter-department-${option.department}`
                    .replace(/[^a-z0-9-]+/gi, "-");
                  return (
                    <div key={option.department} className="[&+&]:border-t [&+&]:border-border [&+&]:pt-[.35rem]">
                      <Field
                        orientation="horizontal"
                        className="rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          id={departmentId}
                          aria-label={option.department}
                          checked={selectedDepartments.has(option.department)}
                          onCheckedChange={(checked) =>
                            toggleDepartment(option.department, checked === true)
                          }
                        />
                        <FieldTitle
                          className="min-w-0 cursor-pointer leading-4"
                          onClick={() =>
                            toggleDepartment(
                              option.department,
                              !selectedDepartments.has(option.department),
                            )
                          }
                        >
                          {option.department}
                        </FieldTitle>
                      </Field>
                      {option.divisions.length > 0 && (
                        <div className="ml-[1.15rem] grid gap-[.1rem] border-l border-border pl-[.55rem]">
                          {option.divisions.map((division) => {
                            const divisionId =
                              `trip-filter-division-${option.department}-${division}`
                                .replace(/[^a-z0-9-]+/gi, "-");
                            return (
                              <Field
                                key={`${option.department}:${division}`}
                                orientation="horizontal"
                                className="rounded-md px-2 py-1.5 hover:bg-muted"
                              >
                                <Checkbox
                                  id={divisionId}
                                  aria-label={`${division}, ${option.department}`}
                                  checked={selectedDivisions.has(division)}
                                  onCheckedChange={(checked) =>
                                    toggleDivision(division, checked === true)
                                  }
                                />
                                <FieldTitle
                                  className="min-w-0 cursor-pointer font-normal leading-4"
                                  onClick={() =>
                                    toggleDivision(
                                      division,
                                      !selectedDivisions.has(division),
                                    )
                                  }
                                >
                                  {division}
                                </FieldTitle>
                              </Field>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={draftDepartments.length === 0 && draftDivisions.length === 0}
                onClick={() => {
                  setDraftDepartments([]);
                  setDraftDivisions([]);
                }}
              >
                <X aria-hidden="true" />
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onApply({
                    departments: draftDepartments,
                    divisions: draftDivisions,
                  });
                }}
              >
                <Check aria-hidden="true" />
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatRangeLabel(range?: DateRange) {
  if (range?.from && range.to) {
    return `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
  }
  if (range?.from) return `From ${format(range.from, "MMM d, yyyy")}`;
  if (range?.to) return `Through ${format(range.to, "MMM d, yyyy")}`;
  return "Any date";
}

function MultiSelectFilter({
  panelKey,
  label,
  pluralLabel,
  options,
  values,
  open,
  onOpenChange,
  onApply,
}: {
  panelKey: PanelKey;
  label: string;
  pluralLabel: string;
  options: Option[];
  values: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState(values);
  const panelId = useId();
  const selected = new Set(draft);
  const optionLabels = new Map(options.map((option) => [option.value, option.label]));
  const selectionLabel = values
    .map((value) => optionLabels.get(value) ?? value)
    .join(", ");

  const toggle = (value: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(value);
    else next.delete(value);
    setDraft([...next]);
  };

  return (
    <Field className="m-0 min-w-0 border-0 p-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative min-w-0" data-filter-dropdown data-filter-key={panelKey}>
        <Button
          className="w-full min-w-0 justify-between"
          type="button"
          variant="outline"
          aria-label={`Filter by ${label.toLocaleLowerCase()}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (!open) setDraft(values);
            onOpenChange(!open);
          }}
        >
          <span className="truncate" title={selectionLabel || undefined}>
            {selectionLabel || `All ${pluralLabel}`}
          </span>
          <ChevronDown className={open ? "rotate-180" : ""} aria-hidden="true" />
        </Button>
        {open && (
          <div id={panelId} role="dialog" aria-label={`${label} options`} className="absolute top-[calc(100%+.3rem)] left-0 z-40 grid w-72 gap-3 rounded-lg border border-border bg-surface p-3 text-foreground shadow-[0_14px_30px_rgb(2_12_27_/_22%)]">
          <div className="max-h-64 overflow-y-auto pr-1">
            <div className="grid gap-1">
              {options.map((option) => {
                const optionId = `trip-filter-${label}-${option.value}`.replace(/[^a-z0-9-]+/gi, "-");
                return (
                  <Field
                    key={option.value}
                    orientation="horizontal"
                    className="rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <Checkbox
                      id={optionId}
                      aria-label={option.label}
                      checked={selected.has(option.value)}
                      onClick={() => toggle(option.value, !selected.has(option.value))}
                    />
                    <FieldTitle
                      className="min-w-0 cursor-pointer font-normal leading-4"
                      onClick={() => toggle(option.value, !selected.has(option.value))}
                    >
                      {option.label}
                    </FieldTitle>
                  </Field>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={draft.length === 0}
              onClick={() => setDraft([])}
            >
              <X aria-hidden="true" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onApply(draft);
              }}
            >
              <Check aria-hidden="true" />
              Apply
            </Button>
          </div>
          </div>
        )}
      </div>
    </Field>
  );
}

export default function TripFilters({
  action,
  initialSearch,
  aircraftOptions,
  agencyOptions,
  selectedAircraft,
  selectedDepartments,
  selectedDivisions,
  datasetMinDate,
  datasetMaxDate,
  startDate,
  endDate,
  initialSort,
}: TripFiltersProps) {
  const initialDateRange =
    startDate || endDate
      ? { from: parseDate(startDate), to: parseDate(endDate) }
      : undefined;
  const datasetStart = parseDate(datasetMinDate);
  const reportedDatasetEnd = parseDate(datasetMaxDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const datasetEnd =
    reportedDatasetEnd && reportedDatasetEnd < today ? reportedDatasetEnd : today;
  const unavailableDates = [
    ...(datasetStart ? [{ before: datasetStart }] : []),
    { after: datasetEnd },
  ];
  const [filters, setFilters] = useState<FilterValues>({
    search: initialSearch,
    aircraft: selectedAircraft,
    departments: selectedDepartments,
    divisions: selectedDivisions,
    dateRange: initialDateRange,
  });
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
  const [dateDraft, setDateDraft] = useState<DateRange | undefined>(initialDateRange);
  const searchTimer = useRef<number>();

  useEffect(() => {
    if (!openPanel || openPanel === "date") return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const dropdown = target.closest<HTMLElement>("[data-filter-dropdown]");
      if (dropdown?.dataset.filterKey !== openPanel) setOpenPanel(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPanel]);

  useEffect(
    () => () => {
      window.clearTimeout(searchTimer.current);
    },
    [],
  );

  const navigate = (next: FilterValues = filters, replace = false) => {
    window.clearTimeout(searchTimer.current);
    const destination = new URL(action, window.location.href);
    const current = new URL(window.location.href);
    const params = new URLSearchParams();
    const search = next.search.trim();

    if (search) params.set("search", search);
    if (aircraftOptions) {
      for (const value of next.aircraft) params.append("aircraft", value);
    }
    for (const value of next.departments) params.append("department", value);
    for (const value of next.divisions) params.append("division", value);
    if (next.dateRange?.from) params.set("startDate", format(next.dateRange.from, "yyyy-MM-dd"));
    if (next.dateRange?.to) params.set("endDate", format(next.dateRange.to, "yyyy-MM-dd"));
    if (initialSort) params.set("sort", initialSort);
    const limit = current.searchParams.get("limit")?.trim();
    if (limit) params.set("limit", limit);

    destination.search = params.toString();
    if (destination.href === window.location.href) return;
    if (replace) window.location.replace(destination.toString());
    else window.location.assign(destination.toString());
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate();
  };

  return (
    <form
      className={`mb-3 grid items-end gap-2 rounded-[.45rem] border border-border bg-surface p-[.65rem] shadow-card max-[1180px]:grid-cols-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1 [&_[data-slot=field-label]]:gap-[.18rem] [&_[data-slot=field-label]_span]:text-[.7rem] [&_[data-slot=field-label]_span]:font-extrabold [&_[data-slot=field-label]_span]:tracking-[.06em] [&_[data-slot=field-label]_span]:text-muted-foreground [&_[data-slot=field-label]_span]:uppercase [&_input]:min-h-[2.2rem] [&_input]:rounded-[.35rem] [&_input]:px-[.55rem] [&_input]:py-[.38rem] [&_input]:text-[.76rem] [&_select]:min-h-[2.2rem] [&_select]:rounded-[.35rem] [&_select]:px-[.55rem] [&_select]:py-[.38rem] [&_select]:text-[.76rem] ${aircraftOptions ? "grid-cols-[minmax(15rem,2fr)_repeat(2,minmax(9rem,1fr))_minmax(12rem,1.35fr)]" : "grid-cols-[minmax(15rem,2fr)_minmax(9rem,1fr)_minmax(12rem,1.35fr)]"}`}
      method="get"
      action={action}
      onSubmit={submit}
    >
      {initialSort && <input type="hidden" name="sort" value={initialSort} />}
      <Field className="max-[1180px]:col-span-full">
        <FieldLabel htmlFor="trip-search">Search the records</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="trip-search"
            type="search"
            name="search"
            value={filters.search}
            placeholder="Route, passenger, agency, comment…"
            onChange={(event) => {
              const search = event.target.value;
              const next = { ...filters, search };
              setFilters(next);
              window.clearTimeout(searchTimer.current);
              searchTimer.current = window.setTimeout(() => navigate(next, true), 600);
            }}
          />
        </InputGroup>
      </Field>

      {aircraftOptions && (
        <>
          {filters.aircraft.map((value) => <input key={value} type="hidden" name="aircraft" value={value} />)}
          <MultiSelectFilter
            panelKey="aircraft"
            label="Aircraft"
            pluralLabel="aircraft"
            options={aircraftOptions}
            values={filters.aircraft}
            open={openPanel === "aircraft"}
            onOpenChange={(open) => setOpenPanel(open ? "aircraft" : null)}
            onApply={(aircraft) => {
              const next = { ...filters, aircraft };
              setFilters(next);
              navigate(next);
            }}
          />
        </>
      )}

      {filters.departments.map((value) => <input key={value} type="hidden" name="department" value={value} />)}
      {filters.divisions.map((value) => <input key={value} type="hidden" name="division" value={value} />)}
      <AgencyMultiSelect
        options={agencyOptions}
        departments={filters.departments}
        divisions={filters.divisions}
        open={openPanel === "agency"}
        onOpenChange={(open) => setOpenPanel(open ? "agency" : null)}
        onApply={({ departments, divisions }) => {
          const next = { ...filters, departments, divisions };
          setFilters(next);
          navigate(next);
        }}
      />

      {filters.dateRange?.from && (
        <input type="hidden" name="startDate" value={format(filters.dateRange.from, "yyyy-MM-dd")} />
      )}
      {filters.dateRange?.to && (
        <input type="hidden" name="endDate" value={format(filters.dateRange.to, "yyyy-MM-dd")} />
      )}
      <Field className="min-w-0">
        <FieldLabel htmlFor="trip-date-range">Date range</FieldLabel>
        <Popover
          open={openPanel === "date"}
          onOpenChange={(open) => {
            if (open) setDateDraft(filters.dateRange);
            setOpenPanel(open ? "date" : null);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id="trip-date-range"
              type="button"
              variant="outline"
              className="w-full min-w-0 justify-start px-2.5 font-normal"
              aria-label="Choose trip date range"
            >
              <CalendarDays aria-hidden="true" />
              <span className="truncate">{formatRangeLabel(filters.dateRange)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto gap-0 p-0 text-xs" align="end">
            <Calendar
              mode="range"
              selected={dateDraft}
              defaultMonth={dateDraft?.from ?? dateDraft?.to ?? datasetEnd}
              onSelect={setDateDraft}
              startMonth={datasetStart}
              endMonth={datasetEnd}
              disabled={unavailableDates}
              showOutsideDays={false}
              numberOfMonths={2}
              className="p-2 [--cell-size:1.75rem] [&_.rdp-month]:gap-[.4rem] [&_.rdp-months]:gap-[.5rem] [&_.rdp-week]:mt-[.1rem] [&_.rdp-week]:w-[calc(var(--cell-size)*7)] [&_.rdp-weekdays]:w-[calc(var(--cell-size)*7)] [&_table]:w-[calc(var(--cell-size)*7)] [&_table]:text-[.72rem] [&_td]:size-[var(--cell-size)] [&_td]:border-0 [&_td]:p-0 [&_td]:align-middle [&_th]:size-[var(--cell-size)] [&_th]:border-0 [&_th]:bg-transparent [&_th]:p-0 [&_th]:text-center [&_th]:text-[.6rem] [&_th]:tracking-normal [&_th]:text-muted-foreground [&_tbody_tr:hover]:bg-transparent"
            />
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!dateDraft?.from && !dateDraft?.to}
                onClick={() => {
                  setDateDraft(undefined);
                }}
              >
                <X aria-hidden="true" />
                Clear
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  const next = { ...filters, dateRange: dateDraft };
                  setFilters(next);
                  setOpenPanel(null);
                  navigate(next);
                }}
              >
                <Check aria-hidden="true" />
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </Field>
    </form>
  );
}
