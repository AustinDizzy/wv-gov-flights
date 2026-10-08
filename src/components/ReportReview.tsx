import { useMemo, useState } from "react";
import { parsePassengers } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface ReviewTrip {
  source_page: number;
  source_row: number;
  date: string;
  tail_no: string | null;
  department: string;
  division: string | null;
  flight_hours: number;
  route: string;
  passengers: string | null;
  comments: string | null;
  invoiced_amount: number | null;
  warnings: string[];
}

export interface ReviewRow {
  id: string;
  trip: ReviewTrip;
  warnings: string[];
  errors: string[];
  action: "create" | "link_existing" | "exclude" | null;
  existingTripId: string | null;
  duplicates: string[];
  flightCandidates: string[];
}

type RowFilter = "all" | "attention" | "reviewed";
type BulkAction = "create" | "exclude";
const noDuplicateValue = "__no_duplicate__";

export default function ReportReview({
  initialRows,
  batchState,
  workflowStatus,
  batchError,
  rowEndpoint,
  publishEndpoint,
  retryEndpoint,
  flightBasePath,
}: {
  initialRows: ReviewRow[];
  batchState: string;
  workflowStatus: string | null;
  batchError: string | null;
  rowEndpoint: string;
  publishEndpoint: string;
  retryEndpoint: string;
  flightBasePath: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const needsAttention = (row: ReviewRow) =>
    !row.action || (row.action !== "exclude" && row.errors.length > 0);
  const unresolved = useMemo(() => rows.filter(needsAttention).length, [rows]);
  const reviewed = rows.length - unresolved;
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "attention") return needsAttention(row);
        if (filter === "reviewed") return !needsAttention(row);
        return true;
      }),
    [filter, rows],
  );
  const visibleIds = visibleRows.map((row) => row.id);
  const selectedVisibleIds = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const cleanUnreviewedVisibleIds = visibleRows
    .filter((row) => !row.action && row.errors.length === 0)
    .map((row) => row.id);

  const workflowFailed = workflowStatus === "errored" || batchState === "failed";
  const workflowMissing = !workflowStatus && batchState === "uploaded";
  const canRetry = workflowFailed || workflowMissing;
  const readyForReview = batchState === "review_required";
  const headline = workflowFailed
    ? "OCR ingestion failed."
    : batchState === "ocr_running" || workflowStatus === "queued" || workflowStatus === "running"
      ? "OCR is still processing."
      : rows.length === 0
        ? "No trip rows were staged."
        : unresolved === 0
          ? "All rows reviewed."
          : `${unresolved} rows need attention.`;

  const update = (id: string, mutate: (row: ReviewRow) => ReviewRow) =>
    setRows((current) => current.map((row) => (row.id === id ? mutate(row) : row)));

  const toggleSetValue = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markRows = async (rowIds: string[], action: BulkAction) => {
    if (rowIds.length === 0) return;
    setMessage("");
    setSavingIds(new Set(rowIds));
    try {
      const response = await fetch(rowEndpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ row_ids: rowIds, action }),
      });
      const data = (await response.json()) as {
        updatedIds?: string[];
        skippedIds?: string[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(data.error ?? "Rows could not be reviewed.");
        return;
      }
      const updated = new Set(data.updatedIds ?? []);
      setRows((current) =>
        current.map((row) =>
          updated.has(row.id)
            ? {
                ...row,
                action,
                existingTripId: null,
                errors: action === "exclude" ? row.errors : [],
              }
            : row,
        ),
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of updated) next.delete(id);
        return next;
      });
      const skipped = data.skippedIds?.length ?? 0;
      setMessage(
        `${updated.size} row${updated.size === 1 ? "" : "s"} marked ${
          action === "create" ? "as new trips" : "excluded"
        }.${skipped ? ` ${skipped} invalid row${skipped === 1 ? " was" : "s were"} left for review.` : ""}`,
      );
    } finally {
      setSavingIds(new Set());
    }
  };

  const save = async (
    row: ReviewRow,
    overrides: Partial<Pick<ReviewRow, "action" | "existingTripId">> = {},
  ) => {
    const nextRow = { ...row, ...overrides };
    setMessage("");
    setSavingIds(new Set([row.id]));
    try {
      const response = await fetch(`${rowEndpoint}/${row.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip: nextRow.trip,
          action: nextRow.action,
          existing_trip_id: nextRow.existingTripId,
        }),
      });
      const data = (await response.json()) as { errors?: string[]; error?: string };
      if (!response.ok) {
        update(row.id, (item) => ({
          ...item,
          errors: data.errors ?? [data.error ?? "Save failed."],
        }));
        return;
      }
      update(row.id, (item) => ({
        ...item,
        action: nextRow.action,
        existingTripId: nextRow.existingTripId,
        errors: nextRow.action === "exclude" ? item.errors : [],
      }));
      setMessage(`Saved row ${row.trip.source_row} from page ${row.trip.source_page}.`);
    } finally {
      setSavingIds(new Set());
    }
  };

  const publish = async () => {
    setMessage("");
    const response = await fetch(publishEndpoint, { method: "POST" });
    const data = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "Publication requested. Flight paths will be fetched and attached automatically."
        : data.error ?? "Publication failed.",
    );
  };

  const retry = async () => {
    setMessage("");
    const response = await fetch(retryEndpoint, { method: "POST" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "OCR retry failed.");
      return;
    }
    setMessage("OCR retry requested.");
    window.setTimeout(() => window.location.reload(), 1500);
  };

  const statusFor = (row: ReviewRow) => {
    if (row.action === "exclude") {
      return { label: "Excluded", className: "bg-[color-mix(in_srgb,var(--line)_65%,transparent)] text-muted-foreground" };
    }
    if (row.errors.length > 0) {
      return { label: "Errors", className: "bg-[#fbe0e0] text-[#8d2525] dark:bg-[#4d2020] dark:text-[#ffb9b9]" };
    }
    if (!row.action) {
      return { label: "Review", className: "bg-[#fff1bd] text-[#795500] dark:bg-[#493a12] dark:text-[#ffe596]" };
    }
    return { label: row.action === "link_existing" ? "Linked" : "Ready", className: "bg-[#d9f3e8] text-[#0e6344] dark:bg-[#123d31] dark:text-[#a6ebd2]" };
  };

  return (
    <div className="min-w-0">
      <div className="sticky top-4 z-12 flex items-center justify-between gap-4 rounded-[.7rem] border border-border bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-[.9rem] py-[.8rem] shadow-[0_8px_24px_rgb(6_21_36_/_8%)] backdrop-blur-xl max-[560px]:static max-[560px]:items-start max-[560px]:flex-col">
        <div className="min-w-0">
          <strong>{headline}</strong>
          <span className="block text-[.76rem] text-muted-foreground">{reviewed} of {rows.length} reviewed</span>
          <Progress
            className="mt-2 w-48"
            value={rows.length > 0 ? (reviewed / rows.length) * 100 : 0}
            aria-label={`${reviewed} of ${rows.length} rows reviewed`}
          />
          {batchError && <p className="mt-1 text-[.8rem] text-destructive">{batchError}</p>}
        </div>
        <div className="flex shrink-0 gap-[.45rem] max-[560px]:w-full max-[560px]:flex-col max-[560px]:[&_[data-slot=button]]:w-full">
          <Button
            variant="gold"
            size="sm"
            type="button"
            disabled={!readyForReview || unresolved > 0}
            onClick={publish}
          >
            Publish batch
          </Button>
          {canRetry && (
            <Button variant="outline" size="sm" type="button" onClick={retry}>
              {workflowMissing ? "Start OCR" : "Retry OCR"}
            </Button>
          )}
        </div>
      </div>

      {readyForReview && (
        <p className="mt-[.65rem] mr-[.15rem] mb-0 ml-[.15rem] text-[.78rem] text-muted-foreground">
          Page and row are shown only to help review this draft. Published trips cite the
          source document, and flight paths are fetched after publication.
        </p>
      )}

      <div className="my-[.8rem] mb-[.55rem] flex items-center justify-between gap-3 max-[900px]:items-stretch max-[900px]:flex-col">
        <ButtonGroup className="flex w-fit shrink-0 gap-1 rounded-[.55rem] border border-border bg-surface p-[.22rem]" aria-label="Filter review rows">
          {([
            ["all", `All ${rows.length}`],
            ["attention", `Needs attention ${unresolved}`],
            ["reviewed", `Reviewed ${reviewed}`],
          ] as const).map(([value, label]) => (
            <Button
              variant={filter === value ? "default" : "outline"}
              size="sm"
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}
            </Button>
          ))}
        </ButtonGroup>
        {readyForReview && (
          <div className="flex flex-wrap justify-end gap-[.35rem] max-[900px]:justify-start max-[560px]:[&_[data-slot=button]]:flex-[1_1_12rem]">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={cleanUnreviewedVisibleIds.length === 0 || savingIds.size > 0}
              onClick={() => markRows(cleanUnreviewedVisibleIds, "create")}
            >
              Mark all clean shown as new ({cleanUnreviewedVisibleIds.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={selectedVisibleIds.length === 0 || savingIds.size > 0}
              onClick={() => markRows(selectedVisibleIds, "create")}
            >
              Mark selected as new
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={selectedVisibleIds.length === 0 || savingIds.size > 0}
              onClick={() => markRows(selectedVisibleIds, "exclude")}
            >
              Exclude selected
            </Button>
          </div>
        )}
      </div>

      {message && <p className="my-2 rounded-[.45rem] bg-[color-mix(in_srgb,var(--success)_9%,transparent)] px-[.65rem] py-[.45rem] text-[.8rem] text-success" role="status">{message}</p>}

      <div className="grid grid-cols-[1.5rem_3.6rem_6.3rem_4.4rem_minmax(10rem,1fr)_3.2rem_5.5rem_10.5rem] items-center gap-x-2 px-[.7rem] py-[.35rem] text-[.64rem] font-extrabold tracking-[.06em] text-muted-foreground uppercase max-[900px]:min-w-[57rem] max-[560px]:hidden">
        <span>
          <Checkbox
            aria-label={allVisibleSelected ? "Deselect all shown rows" : "Select all shown rows"}
            checked={allVisibleSelected}
            onCheckedChange={() =>
              setSelectedIds((current) => {
                const next = new Set(current);
                for (const id of visibleIds) {
                  if (allVisibleSelected) next.delete(id);
                  else next.add(id);
                }
                return next;
              })
            }
          />
        </span>
        <span>Source</span>
        <span>Date</span>
        <span>Aircraft</span>
        <span>Route</span>
        <span>Hours</span>
        <span>Status</span>
        <span>Quick review</span>
      </div>
      <div className="overflow-hidden rounded-[.7rem] border border-border bg-surface shadow-raised max-[900px]:overflow-x-auto max-[560px]:overflow-visible">
        {visibleRows.map((row) => {
          const warnings = [...row.warnings, ...row.trip.warnings];
          const status = statusFor(row);
          const expanded = expandedIds.has(row.id);
          const saving = savingIds.has(row.id);
          return (
            <div className="border-b border-border bg-surface last:border-b-0" key={row.id}>
              <div className="grid min-h-[3.3rem] grid-cols-[1.5rem_3.6rem_6.3rem_4.4rem_minmax(10rem,1fr)_3.2rem_5.5rem_10.5rem] items-center gap-x-2 px-[.7rem] py-[.45rem] text-[.79rem] hover:bg-muted/50 max-[900px]:min-w-[57rem] max-[560px]:min-w-0 max-[560px]:grid-cols-[1.25rem_2.7rem_5.7rem_minmax(0,1fr)] max-[560px]:gap-x-[.4rem] max-[560px]:[&>:nth-child(4)]:hidden max-[560px]:[&>:nth-child(6)]:hidden max-[560px]:[&>:nth-child(7)]:hidden max-[560px]:[&>:nth-child(8)]:col-[3/-1]">
                <label className="grid place-items-center">
                  <Checkbox
                    aria-label={`Select page ${row.trip.source_page}, row ${row.trip.source_row}`}
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => toggleSetValue(setSelectedIds, row.id)}
                  />
                </label>
                <span className="grid leading-[1.05] [&_small]:mt-[.2rem] [&_small]:text-[.64rem] [&_small]:font-medium [&_small]:text-muted-foreground">
                  <strong>P{row.trip.source_page}</strong>
                  <small>Row {row.trip.source_row}</small>
                </span>
                <span className="whitespace-nowrap">{row.trip.date || "Missing"}</span>
                <span className="whitespace-nowrap">{row.trip.tail_no ?? "—"}</span>
                <span className="truncate font-bold" title={row.trip.route}>
                  {row.trip.route || "Missing route"}
                </span>
                <span>{row.trip.flight_hours}</span>
                <span className="flex items-center gap-[.3rem]">
                  <span className={`inline-flex rounded-full px-[.42rem] py-[.12rem] text-[.66rem] font-extrabold whitespace-nowrap ${status.className}`}>{status.label}</span>
                  {warnings.length > 0 && (
                    <span
                      className="text-[.65rem] font-[750] text-muted-foreground"
                      title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
                    >
                      +{warnings.length}
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-end gap-1 max-[560px]:col-[3/-1]">
                  <Button
                    variant={row.action === "create" ? "default" : "outline"}
                    size="xs"
                    type="button"
                    disabled={saving || row.errors.length > 0}
                    onClick={() => markRows([row.id], "create")}
                  >
                    New
                  </Button>
                  <Button
                    variant={row.action === "exclude" ? "default" : "outline"}
                    size="xs"
                    type="button"
                    disabled={saving}
                    onClick={() => markRows([row.id], "exclude")}
                  >
                    Exclude
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleSetValue(setExpandedIds, row.id)}
                  >
                    {expanded ? "Close" : "Edit"}
                  </Button>
                </span>
              </div>

              {expanded && (
                <div className="border-t border-border bg-[color-mix(in_srgb,var(--paper)_55%,var(--surface))] p-[.85rem]">
                  <div className="mb-[.7rem] flex items-baseline gap-2 text-[.82rem] [&_span]:text-muted-foreground">
                    <strong>{row.trip.department || "Missing agency"}</strong>
                    {row.trip.division && <span>{row.trip.division}</span>}
                  </div>
                  {(warnings.length > 0 || row.errors.length > 0) && (
                    <div className="mb-[.7rem] flex flex-wrap gap-[.35rem]">
                      {warnings.map((warning) => (
                        <Badge variant="warning" key={warning}>{warning}</Badge>
                      ))}
                      {row.errors.map((error) => (
                        <span className="rounded-[.35rem] border border-[color-mix(in_srgb,var(--destructive)_45%,var(--border))] bg-destructive/5 px-2 py-[.2rem] text-[.72rem] text-destructive" key={error}>{error}</span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-[.55rem] max-[560px]:grid-cols-2 [&_input]:min-h-9 [&_input]:px-[.55rem] [&_input]:py-[.4rem] [&_select]:min-h-9 [&_select]:px-[.55rem] [&_select]:py-[.4rem] [&_textarea]:min-h-18 [&_textarea]:px-[.55rem] [&_textarea]:py-[.45rem]">
                    <Label>
                      Date
                      <Input
                        type="date"
                        value={row.trip.date}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, date: event.target.value },
                          }))
                        }
                      />
                    </Label>
                    <Label>
                      Tail number
                      <Input
                        value={row.trip.tail_no ?? ""}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, tail_no: event.target.value || null },
                          }))
                        }
                      />
                    </Label>
                    <Label>
                      Hours
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.trip.flight_hours}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, flight_hours: Number(event.target.value) },
                          }))
                        }
                      />
                    </Label>
                    <Label>
                      Invoice dollars
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.trip.invoiced_amount ?? ""}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: {
                              ...item.trip,
                              invoiced_amount: event.target.value ? Number(event.target.value) : null,
                            },
                          }))
                        }
                      />
                    </Label>
                    <Label className="col-span-2">
                      Department
                      <Input
                        value={row.trip.department}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, department: event.target.value },
                          }))
                        }
                      />
                    </Label>
                    <Label className="col-span-2">
                      Division
                      <Input
                        value={row.trip.division ?? ""}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, division: event.target.value || null },
                          }))
                        }
                      />
                    </Label>
                    <Label className="col-span-full">
                      Route
                      <Input
                        value={row.trip.route}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, route: event.target.value },
                          }))
                        }
                      />
                    </Label>
                    <Label className="col-span-2">
                      Passengers{" "}
                      <span className="ml-[.3rem] text-[.65rem] font-medium text-muted-foreground">
                        {parsePassengers(row.trip.passengers).length} detected
                      </span>
                      <Textarea
                        value={row.trip.passengers ?? ""}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, passengers: event.target.value || null },
                          }))
                        }
                      />
                    </Label>
                    <Label className="col-span-2">
                      Comments
                      <Textarea
                        value={row.trip.comments ?? ""}
                        onChange={(event) =>
                          update(row.id, (item) => ({
                            ...item,
                            trip: { ...item.trip, comments: event.target.value || null },
                          }))
                        }
                      />
                    </Label>
                    {row.duplicates.length > 0 && (
                      <div className="col-span-2 grid gap-2">
                        <Label id={`duplicate-label-${row.id}`}>
                          Link source document to an existing trip
                        </Label>
                        <Select
                          value={row.existingTripId ?? noDuplicateValue}
                          onValueChange={(value) =>
                            update(row.id, (item) => ({
                              ...item,
                              existingTripId:
                                value === noDuplicateValue ? null : value,
                            }))
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-labelledby={`duplicate-label-${row.id}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={noDuplicateValue}>
                              Choose a duplicate…
                            </SelectItem>
                            {row.duplicates.map((id) => (
                              <SelectItem key={id} value={id}>{id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {row.flightCandidates.length > 0 && (
                    <div className="mt-[.7rem] flex flex-wrap items-center gap-[.4rem] text-[.7rem] text-muted-foreground [&_a]:rounded-[.35rem] [&_a]:border [&_a]:border-border [&_a]:bg-surface [&_a]:px-[.4rem] [&_a]:py-[.15rem] [&_a]:font-mono [&_a]:text-foreground [&_a]:no-underline">
                      <span>Available paths (best matches attach automatically after publishing)</span>
                      {row.flightCandidates.map((id) => (
                        <a
                          href={`${flightBasePath}/${id}`}
                          target="_blank"
                          rel="noreferrer"
                          key={id}
                        >
                          {id}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="mt-[.7rem] flex justify-end gap-[.4rem]">
                    {row.duplicates.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={saving || !row.existingTripId}
                        onClick={() => save(row, { action: "link_existing" })}
                      >
                        Link existing trip
                      </Button>
                    )}
                    <Button
                      size="sm"
                      type="button"
                      disabled={saving}
                      onClick={() => save(row)}
                    >
                      {saving ? "Saving…" : "Save edits"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visibleRows.length === 0 && <p className="px-6 py-12 text-center text-muted-foreground">No rows match this filter.</p>}
      </div>
    </div>
  );
}
