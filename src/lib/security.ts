function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

export function sha256Bytes(hex: string): Uint8Array | null {
  return /^[a-f0-9]{64}$/i.test(hex) ? hexToBytes(hex) : null;
}

export function r2ResponseLength(object: Pick<R2Object, "size" | "range">): number {
  const range = object.range;
  if (!range) return object.size;
  if ("suffix" in range && range.suffix != null) {
    return Math.min(range.suffix, object.size);
  }
  if ("length" in range && range.length != null) return range.length;
  return Math.max(0, object.size - (("offset" in range && range.offset) || 0));
}

export function r2ContentRange(
  object: Pick<R2Object, "size" | "range">,
): string | null {
  const range = object.range;
  if (!range) return null;
  const length = r2ResponseLength(object);
  if (length <= 0) return null;
  const start =
    "suffix" in range
      ? Math.max(0, object.size - length)
      : ("offset" in range && range.offset) || 0;
  return `bytes ${start}-${start + length - 1}/${object.size}`;
}
