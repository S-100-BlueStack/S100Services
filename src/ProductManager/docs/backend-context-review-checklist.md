# Product Manager backend context review checklist

This checklist must be completed before Product Manager backend implementation begins.

Its purpose is to ensure changes are made inside the current backend framework rather than from assumptions based on frontend behavior, partial repository views, or earlier discussions.

## 1. Repository state

Record:

```text
Repository:
Branch:
Commit:
Working tree clean: Yes/No
Local uncommitted files:
Backend solution path:
Relevant backend project paths:
Frontend baseline commit:
```

Rules:

- Use the latest committed backend when the working tree is clean.
- When local backend changes exist, obtain a targeted context package containing the relevant files before proposing replacements.
- Do not mix unreviewed local work into an implementation package.
- Record all generated or environment-specific files that must not be included.

## 2. Solution and project map

Identify the actual paths and responsibilities for:

- API host/startup configuration;
- Product controllers;
- Export controller;
- Dashboard controller;
- Analyze/Product lookup controller;
- Product History controller;
- service layer;
- repository/data-access layer;
- background jobs;
- ArcGIS integration;
- file operations;
- authentication/authorization;
- exception handling;
- API response wrappers;
- DTOs/view models;
- tests;
- configuration files;
- OpenAPI/Swagger configuration.

Create a compact dependency map, for example:

```text
HTTP route
  -> Controller method
  -> Application/service method
  -> Repository / ArcGIS / file operation
  -> Response mapping
  -> Global exception handling
```

Use actual names and paths from the repository.

## 3. Endpoint inventory

For each endpoint below, record the actual route, HTTP verb, controller method, service method, response type, error behavior, authentication, tests, and known consumers.

### Export and Rollback

- `newedition`
- `newupdate`
- `rollback`

Capture:

```text
Route:
HTTP verb:
Controller:
Method:
Request parameters:
exportTarget parameter name:
exportTarget type:
Default value:
Accepted numeric values:
Accepted string values:
Current target support:
Service method:
File/ArcGIS operation:
Response type:
Typical duration:
File-lock failure behavior:
Automatic retry behavior:
Tests:
Consumers:
```

### Product mutations

- Freeze
- Unfreeze
- Send to IC-ENC

Capture the same request flow and whether they touch the same Product file as Export/Rollback.

### AOI

Capture:

```text
Route:
Controller:
AOI source:
Product state source:
Number of data-source calls:
Sequential loops:
Batch methods already available:
Geometry representation:
Mapping steps:
Serialization steps:
Compression configuration:
Caching configuration:
Typical payload size:
Typical duration:
Tests:
Consumers:
```

### Dashboard

Capture:

```text
Route:
Controller:
Activity source:
Date/time interpretation:
Sort fields:
Stable event ID:
Current filters:
Current summary calculation:
Current maximum result behavior:
Response shape:
Consumers:
Tests:
```

### Analyze Product lookup

Capture:

```text
Route:
Controller:
Response DTO:
Geometry property type:
Is geometry a JSON object or encoded string:
Why current representation exists:
Other consumers of the same DTO/model:
XML/report fields:
Tests:
```

### Product History

Capture:

```text
Route:
Controller:
Event source:
Event ID:
Ordering:
Outcome/failure support:
Actor support:
Correlation/job/report references:
Response shape:
Tests:
Consumers:
```

## 4. ExportTarget binding review

Inspect the actual enum and model binding.

Record:

- enum name and namespace;
- numeric assignments;
- whether numeric values are stored, logged, serialized, or used by other projects;
- whether System.Text.Json enum string conversion is configured globally;
- whether query-string enum binding currently accepts numbers and names;
- whether casing is case-sensitive;
- Swagger/OpenAPI representation;
- all callers using numeric values;
- safest way to reject numeric public input without breaking internal usage.

Required decision:

```text
Public parameter name:
Public allowed values: All / S100 / S57
Numeric public values accepted temporarily: Yes/No
Compatibility reason, if Yes:
Planned removal point:
Unsupported-target HTTP status:
Unsupported-target error code:
```

## 5. Background-job framework review

Confirm the actual current framework from source code and package references.

Record:

```text
Framework:
Version:
Storage provider:
Storage database/configuration:
Server/worker registration:
Queue configuration:
Worker count:
Recurring jobs:
Existing job classes:
Existing job status API:
Dashboard exposure:
Dashboard authorization:
Automatic retry defaults:
Job argument conventions:
Job cancellation support:
Job metadata/parameter support:
Application-owned job status mapping:
Tests:
```

Questions to answer:

- Can Export/Rollback call the existing service layer from a job safely?
- Are request-scoped services involved?
- Does ArcGIS/file processing require a dedicated queue or worker count of one?
- Does the job framework already persist enough state for job-by-ID status?
- Can Product metadata be indexed in existing job storage without schema changes?
- How are failed/deleted jobs retained?
- How is requester identity represented after the HTTP request ends?
- What happens after process/server restart?
- Are retries safe for the current operations?

Do not add a new background-job framework.

## 6. File-lock behavior review

Windows file locking remains the concurrency authority.

Trace and, when safe, reproduce:

- exception type when the Product file is already open/in use;
- where the exception originates;
- whether it is wrapped;
- current HTTP status and response;
- whether the Product name can be identified safely;
- whether the error is distinguishable from permission, missing file, and generic I/O errors;
- cleanup behavior after failed operations;
- behavior after API or job-process termination;
- whether Rollback, Export, Freeze/Unfreeze, and Send use the same file or different resources.

Required decision:

```text
Can file-in-use be mapped reliably to 409 Conflict: Yes/No
Exception(s) to map:
Cases that must not be mapped to conflict:
Stable error code:
Frontend message:
```

Do not add an application-level lock.

## 7. Error and response conventions

Identify the actual current conventions:

- global exception middleware/handler;
- `ProblemDetails` usage;
- custom `ApiResponse` or other wrappers;
- validation error behavior;
- correlation ID middleware;
- logging scopes;
- controller-specific ad hoc responses;
- OpenAPI annotations;
- frontend parser expectations.

Create a table:

| Endpoint area | Success convention | Error convention | Machine code | Correlation ID | Action |
| ------------- | ------------------ | ---------------- | ------------ | -------------- | ------ |
| Export        |                    |                  |              |                |        |
| Rollback      |                    |                  |              |                |        |
| AOI           |                    |                  |              |                |        |
| Dashboard     |                    |                  |              |                |        |
| Analyze       |                    |                  |              |                |        |
| History       |                    |                  |              |                |        |

Rules:

- Standardize touched endpoints incrementally.
- Do not perform a repository-wide response rewrite in the first task.
- Reuse the dominant existing convention.
- Document any temporary frontend compatibility adapter.

## 8. Authentication and authorization

For every touched endpoint, record:

- authentication scheme;
- authorization attribute/policy;
- anonymous access, if any;
- requester identity format;
- whether background jobs need to preserve requester identity;
- whether job status is visible only to the initiating user or to all authorized Product Manager users;
- whether job framework dashboards are protected;
- audit requirements.

Do not weaken current authorization as part of implementation.

## 9. Serialization and geometry review

Trace the Analyze and AOI geometry path end to end:

```text
Data source type
  -> repository/model type
  -> service type
  -> DTO type
  -> JSON serializer output
  -> frontend normalization
  -> ArcGIS geometry construction
```

Record:

- object versus JSON-encoded string at each boundary;
- explicit `JsonSerializer.Serialize`/`Deserialize` calls;
- reused DTOs or models;
- other API consumers;
- geometry spatial reference assumptions;
- malformed geometry handling;
- payload-size impact.

Do not change geometry shape until all consumers and the reason for the current representation are understood.

## 10. AOI performance baseline

Capture at least three representative runs in the same environment.

Template:

| Run | Product count | Geometry source ms | Product state ms | Mapping ms | Serialization ms | Total ms | Payload bytes | Compressed bytes |
| --- | ------------: | -----------------: | ---------------: | ---------: | ---------------: | -------: | ------------: | ---------------: |
| 1   |               |                    |                  |            |                  |          |               |                  |
| 2   |               |                    |                  |            |                  |          |               |                  |
| 3   |               |                    |                  |            |                  |          |               |                  |

Also record:

- number of repository/data-source calls;
- sequential versus parallel behavior;
- ArcGIS dispatch behavior;
- database query text or method names;
- cache warm/cold state;
- local versus deployed host;
- network timing when measured from the browser.

Do not propose pagination before this baseline exists.

## 11. Dashboard scalability baseline

Capture:

- events in one day;
- events in seven days;
- estimated events with 50+ users;
- current response size;
- query duration;
- mapping/serialization duration;
- browser filtering duration;
- stable event ID availability;
- current indexes visible to the development team;
- indexes that may require administrator review.

Determine whether cursor paging is possible now.

If not, document the temporary deterministic page/offset strategy.

## 12. Product History event capability review

Determine whether the current event source can represent:

- success/failure outcome;
- validation failure reason;
- Export failure;
- Rollback failure;
- report processing failure;
- actor/system process;
- job ID;
- correlation ID;
- report ID;
- previous/new state.

Do not implement historical map reconstruction in Product History.

## 13. Tests and build commands

Record exact commands:

```text
Backend restore:
Backend build:
Backend unit tests:
Backend integration tests:
Frontend check: cd src/ProductManager && npm run check
```

Record environment dependencies:

- SQL Server;
- ArcGIS installation/runtime;
- Windows authentication;
- file shares;
- secrets/configuration;
- job storage;
- test data;
- administrator-only setup.

Identify which tests can run in CI and which require the development environment.

## 14. Consumer and deployment review

For each changed endpoint, identify:

- Product Manager frontend;
- Swagger/manual users;
- other frontend applications;
- ArcGIS tools;
- scheduled jobs;
- scripts;
- tests;
- external integrations.

Determine deployment order:

```text
Backend-first compatible:
Frontend-first compatible:
Must deploy together:
Temporary compatibility period:
Rollback behavior:
```

## 15. Context report template

Create the report before implementation using this structure:

```markdown
# Product Manager backend context report

## Baseline

- Commit:
- Working tree:
- Backend projects:
- Frontend baseline:

## Architecture map

### Export/Update/Rollback

### AOI

### Dashboard

### Analyze

### Product History

### Product mutations

## Existing framework decisions

- Background jobs:
- File locking:
- Responses/errors:
- Authentication:
- Serialization:
- Tests:

## Endpoint contracts as implemented today

## Confirmed extension points

## Risks and constraints

## Administrator/architecture-owner dependencies

## Recommended first implementation package

## Files required for the implementation package

## Verification commands
```

## 16. Exit gate

Implementation may begin only when:

- the report is complete;
- the exact baseline is known;
- relevant files are available in full;
- current consumers are identified;
- no unapproved schema or lock change is included;
- job framework and file-lock behavior are confirmed from current source;
- error and test conventions are known;
- the first package scope matches `backend-implementation-roadmap.md`.
