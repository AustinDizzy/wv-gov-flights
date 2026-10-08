import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function BackfillForm({
  endpoint,
  aircraft,
}: {
  endpoint: string;
  aircraft: Array<{ id: string; tail_no: string }>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [aircraftId, setAircraftId] = useState("");
  const [message, setMessage] = useState("");
  const submit = async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start_date: start,
        end_date: end,
        aircraft_ids: aircraftId ? [aircraftId] : [],
      }),
    });
    const body = (await response.json()) as { workflow_instance_id?: string; error?: string };
    setMessage(response.ok ? `Workflow ${body.workflow_instance_id} started.` : body.error ?? "Backfill failed.");
  };
  return (
    <Card>
      <CardHeader><CardTitle>Manual backfill</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <Field><FieldLabel htmlFor="backfill-start">Start date</FieldLabel><Input id="backfill-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="backfill-end">End date</FieldLabel><Input id="backfill-end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
        <Field>
          <FieldLabel htmlFor="backfill-aircraft">Aircraft</FieldLabel>
          <Select
            value={aircraftId || "all"}
            onValueChange={(value) => setAircraftId(value === "all" ? "" : value)}
          >
            <SelectTrigger id="backfill-aircraft" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All active aircraft</SelectItem>
              {aircraft.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.tail_no}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {message && <p role="status">{message}</p>}
      </CardContent>
      <CardFooter><Button type="button" onClick={submit}>Start backfill</Button></CardFooter>
    </Card>
  );
}

export function CandidateAction({ endpoint }: { endpoint: string }) {
  const [state, setState] = useState("");
  const act = async (action: "confirm" | "reject") => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setState(response.ok ? action : "error");
  };
  return (
    <div className="mt-6 flex flex-wrap gap-[.7rem]">
      <ButtonGroup>
        <Button size="sm" onClick={() => act("confirm")} disabled={Boolean(state)}>Confirm</Button>
        <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={Boolean(state)}>Reject</Button>
      </ButtonGroup>
      {state && <span className="text-muted-foreground">{state === "error" ? "Update failed" : state}</span>}
    </div>
  );
}

export function GeometryEditor({
  endpoint,
  initialGeometry,
}: {
  endpoint: string;
  initialGeometry: unknown;
}) {
  const [operation, setOperation] = useState<"merge" | "trim" | "split" | "correct">("correct");
  const [note, setNote] = useState("");
  const [geometry, setGeometry] = useState(JSON.stringify(initialGeometry, null, 2));
  const [message, setMessage] = useState("");
  const save = async () => {
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation,
          note: note.trim() || null,
          geometry: JSON.parse(geometry),
        }),
      });
      const result = (await response.json()) as { updated?: boolean; error?: string };
      setMessage(
        response.ok
          ? "Geometry updated."
          : result.error ?? "Geometry update failed.",
      );
    } catch {
      setMessage("Geometry must be valid GeoJSON.");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Correct the observed geometry</CardTitle>
        <CardDescription>Update the current path and record the reason in the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="geometry-operation">Operation</FieldLabel>
          <Select
            value={operation}
            onValueChange={(value) => setOperation(value as typeof operation)}
          >
            <SelectTrigger id="geometry-operation" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["correct", "trim", "split", "merge"].map((value) => (
                <SelectItem value={value} key={value}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor="geometry-note">Note</FieldLabel><Input id="geometry-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></Field>
        <Field className="md:col-span-2"><FieldLabel htmlFor="geometry-json">GeoJSON feature</FieldLabel><Textarea id="geometry-json" className="min-h-96 font-mono text-[.82rem]" value={geometry} onChange={(event) => setGeometry(event.target.value)} /></Field>
        {message && <p role="status">{message}</p>}
      </CardContent>
      <CardFooter><Button type="button" onClick={save}>Update geometry</Button></CardFooter>
    </Card>
  );
}
