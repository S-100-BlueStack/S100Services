# Export executable configuration and diagnostics

Merge these sections into the Worker's existing `appsettings.json`. Private
appsettings files are excluded from the context archive and are not replaced by
this delivery.

```json
{
  "S100Compiler": {
    "ExecutablePath": "C:\\Program Files\\s100compiler\\s100compiler.exe"
  },
  "S100Mapper": {
    "ExecutablePath": "C:\\Program Files\\s100mapper\\s100mapper.exe"
  },
  "S57Compiler": {
    "ExecutablePath": "C:\\Program Files\\s57compiler\\s57compiler.exe"
  }
}
```

All three paths retain their existing Program Files defaults when a setting is
absent. Environment overrides use `S100Compiler__ExecutablePath`,
`S100Mapper__ExecutablePath`, and `S57Compiler__ExecutablePath`. Restart the
Worker after changing paths because the export engine is registered as a singleton.

API and Worker startup warn when their inherited `JAVA_TOOL_OPTIONS` is absent
or blank. Each export-tool launch repeats that check. The value is never logged
by these checks, changed, or required for execution. After changing a machine
environment variable, restart the relevant processes so they inherit it.

Immediately before each compiler or mapper launch, the log includes its full
executable path, `LastModifiedUtc` (the file's Date Modified in UTC), compiler
filename, and dataset name. The timestamp is diagnostic only: no age threshold
or version decision is applied, and metadata access failures only warn.

Geodatabase and DPC profiling events now carry their component class in
`SourceContext`. Existing Microsoft ILogger categories remain intact. API,
Worker and bootstrap logging also supply `ProductCatalogue` as a fallback
source context for uncategorized static or dependency events, so the bracketed
source column is populated.
