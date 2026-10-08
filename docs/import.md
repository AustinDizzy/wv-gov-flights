# Import operations

## Legacy import

`scripts/import-legacy.ts` accepts a read-only SQLite database or a plain SQL dump and an optional datasource root. Repeat `--flight-paths /path/to/export.sql` to merge supplemental legacy `flight_paths` exports; exact tail/date/geometry duplicates are removed. It creates:

- `legacy-import.sql` for migrated D1 records;
- `r2-upload-manifest.json` mapping local PDFs to readable `datasources/{source}/{filename}` R2 keys;
- `reconciliation.json` with counts, totals, missing files, orphan links/trips, and ambiguous duplicate groups.

WKT paths attached to trips become linked GeoJSON observed-flight records.
Legacy `flight_paths` rows not already represented by a trip geometry become
unmatched observations. Overlapping datasource links are preserved.

`--apply-local` may apply the generated file to local D1. There is deliberately no remote-apply flag.
