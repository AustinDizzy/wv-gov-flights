async function streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
  return new Response(stream).arrayBuffer();
}

export async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return streamToArrayBuffer(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
  );
}

export async function gunzipBytes(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return streamToArrayBuffer(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  );
}

export function telemetryArtifactKey({
  provider,
  aircraftIcao,
  sourceDate,
  artifactId,
}: {
  provider: string;
  aircraftIcao: string;
  sourceDate: string;
  artifactId: string;
}): string {
  return [
    "telemetry",
    provider.toLocaleLowerCase(),
    aircraftIcao.toLocaleLowerCase(),
    sourceDate,
    `${artifactId}.json.gz`,
  ].join("/");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
