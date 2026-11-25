# DataCatalogue ChatGPT workflow

Apply the [repository agent instructions](../../../AGENTS.md) and
[DataCatalogue agent instructions](../AGENTS.md) to repository work. Read the
[frontend README](../README.md) for setup and supported source modes. Keep
original source text, including Danish notice content, in its original language.

## Architect chat and Work

1. In the architect chat, clarify requirements and contracts, prioritize work,
   pin the baseline, and agree on scope and acceptance criteria. Prepare a
   focused source export and task for Work.
2. Give Work the task, relevant repository instructions, commit-pinned source
   archive with checksums, and any handoff needed to resume. Include the
   decisions, evidence, open gaps and next action. Verify the inputs on resume
   before editing. Request a targeted export when required source is missing.
3. In Work, implement only the agreed scope, update the owning documentation,
   run the available checks, and return the complete replacement files and
   verification evidence. Return the candidate to the architect chat for
   review. The repository owner performs local acceptance and commits.

Keep a portable checkpoint when an accepted milestone or a long revision
sequence would otherwise be hard to recover. Use a handoff when moving the work
to a new chat. Record the exact baseline, artifacts, completed checks and their
provenance, open decisions, and first safe action. Include the relevant files
when transferring work between chats.

## Documentation owners

| For                                                                   | Read                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Current decisions, acceptance and next work                           | [Project tracker](PROJECT_TRACKER.md)                                                               |
| Live Package, Workstream, Workspace and contextual Job semantics      | [Live scope](FEATURE_WORKSPACE_SCOPE.md)                                                            |
| Preserved mock Feature/Work stream requirements and acceptance checks | [Historical demo scope](FEATURE_WORK_STREAM_SCOPE.md) and [DC-001 validation](DC_001_VALIDATION.md) |
| Implementation boundaries and API behavior                            | [Architecture](ARCHITECTURE.md) and [backend contracts](BACKEND_CONTRACTS.md)                       |
| Backend dependencies and deployment checks                            | [Gap register](DC_API_BACKEND_GAPS.md)                                                              |
| Component decisions and narrowly scoped exceptions                    | [Calcite usage log](CALCITE_USAGE_LOG.md)                                                           |

The live Main Map presents Packages. Workstream names the backend Pipeline in
the UI. Workspace remains a separate geographic work area. Use the historical
scope when maintaining the separate mock prototype.
