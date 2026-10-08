import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

async function sha256(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function PdfUpload({ endpoint }: { endpoint: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "hashing" | "uploading" | "done">("idle");
  const [message, setMessage] = useState("");

  const upload = async () => {
    if (!file) return;
    setMessage("");
    try {
      setState("hashing");
      const digest = await sha256(file);
      setState("uploading");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "x-file-size": String(file.size),
          "x-file-name": encodeURIComponent(file.name),
          "x-file-sha256": digest,
        },
        body: file,
      });
      const data = (await response.json()) as {
        batch_id?: string;
        error?: string;
        review_url?: string;
        warning?: string;
      };
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setState("done");
      if (data.review_url) window.location.assign(data.review_url);
      else setMessage(data.warning ?? `Upload accepted as batch ${data.batch_id}.`);
    } catch (cause) {
      setState("idle");
      setMessage(cause instanceof Error ? cause.message : "Upload failed.");
    }
  };

  return (
    <Card>
      <CardContent className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="pdf-report">PDF report</FieldLabel>
          <Input
          id="pdf-report"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        </Field>
        {file && <p className="text-muted-foreground">{file.name} · {(file.size / 1_048_576).toFixed(2)} MiB</p>}
        {message && <p role="status" className={state === "done" ? "text-success" : "text-destructive"}>{message}</p>}
      </CardContent>
      <CardFooter>
        <Button size="lg" type="button" onClick={upload} disabled={!file || state !== "idle"}>
        {state === "hashing" ? "Computing SHA-256…" : state === "uploading" ? "Uploading…" : state === "done" ? "Uploaded" : "Upload and OCR"}
        </Button>
      </CardFooter>
    </Card>
  );
}
