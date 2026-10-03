# DataCatalogue Project Instructions

## Stack

Use:

- C# / .NET 10
- ASP.NET Core 10
- Controllers
- ASP.NET Core built-in OpenAPI
- Scalar
- Swagger UI / Swashbuckle
- Eventuous
- Serilog

Repository baseline:

`https://github.com/S-100-BlueStack/S100Services/tree/DataCatalogue`

Eventuous:

`https://github.com/Eventuous/eventuous`

Treat previously inspected repository content as potentially stale. Re-read relevant files, commits, diffs, or links when correctness depends on the latest code.

## Language

Always reply in English.

The user may write in Danish; understand it normally.

All code, identifiers, filenames, comments, XML documentation, exception messages, and API descriptions must be in English.

## C# conventions

Use .NET 10 and modern C# supported by .NET 10.

Never use top-level statements.

Always use an explicit `Program` class and `Main` method.

Keep `Program.cs` small and move substantial service or middleware configuration into focused extension methods when appropriate.

Follow existing project conventions unless there is a strong technical reason not to.

## API style

Use ASP.NET Core Controllers by default.

Do not convert controllers to Minimal APIs unless explicitly requested.

Keep controllers thin. Controllers should handle HTTP concerns; business logic belongs in application/domain services.

Use constructor dependency injection.

Use API versioning consistently for public endpoints.

Use correct HTTP status codes and prefer ASP.NET Core `ProblemDetails` for errors.

Do not expose Eventuous aggregates, domain state, persistence models, or infrastructure types directly through the API. Use explicit request/response DTOs.

## OpenAPI, Scalar and Swagger

ASP.NET Core's built-in OpenAPI generator is the authoritative source of the OpenAPI documents.

Scalar is the preferred interactive API documentation/client UI.

Swagger UI is retained as a secondary UI.

Both Scalar and Swagger UI must consume the same OpenAPI description.

Do not maintain separate OpenAPI definitions.

Prefer built-in OpenAPI document, operation, and schema transformers for customization.

Do not use `AddSwaggerGen()` for OpenAPI document generation unless there is a specific requirement that built-in OpenAPI cannot satisfy.

## Eventuous

Eventuous is the primary event-sourcing framework, but it must not be forced onto every feature.

Use Eventuous for commands, aggregates, state transitions, domain events, event streams, and event-sourced persistence.

Typical flow:

`Controller -> Application/Command Service -> Eventuous State/Aggregate -> Event Store`

Use ordinary services for functionality that does not benefit from event sourcing.

Do not assume Eventuous APIs from memory. Verify unfamiliar APIs against the version referenced by the current project.

Do not silently upgrade Eventuous or other dependencies.

The project already has an `InMemoryEventStore`. Reuse it unless another event store is explicitly required.

Avoid unnecessary coupling to the in-memory implementation, but do not introduce speculative abstractions for hypothetical future storage.

## Architecture

Preserve the existing solution and project structure by default.

Do not automatically reorganize the repository into Clean Architecture layers or create additional projects.

Add layers, interfaces, abstractions, or projects only when they clearly improve correctness, maintainability, testability, or separation of concerns.

Prefer the smallest coherent change.

Do not rewrite unrelated code.

## Async and cancellation

Use async APIs for I/O.

Avoid `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()` in normal application code.

Accept and propagate `CancellationToken` where cancellation is meaningful.

## Logging

Use the existing Serilog infrastructure.

Prefer structured logging:

```csharp
logger.LogInformation(
    "Processing catalogue {CatalogueId}",
    catalogueId);
```

Do not log secrets, tokens, credentials, or unnecessarily sensitive data.

## Dependencies

Prefer functionality already available in .NET, ASP.NET Core, and existing project dependencies.

Add NuGet packages only when they provide a meaningful advantage.

Avoid packages for trivial functionality.

## Code quality

Prioritize:

1. correctness
2. maintainability
3. clarity
4. simplicity
5. appropriate performance

Avoid speculative abstractions, unnecessary wrappers, and interfaces that provide no clear value.

Comments should explain why, not restate obvious code.

Do not invent missing APIs, files, schema, or configuration. State assumptions when necessary.

## Existing code

Before modifying existing code:

1. inspect the latest implementation;
2. understand the surrounding architecture;
3. follow existing conventions where sensible;
4. make the smallest coherent change;
5. keep dependency registration and configuration consistent.

If the current approach is materially suboptimal, briefly explain why and recommend a better option.

## Testing

Update relevant tests when behavior changes.

Prefer xUnit unless the existing project uses another framework.

For ASP.NET Core integration tests, prefer `WebApplicationFactory<TEntryPoint>`.

Do not add mocking or assertion libraries unless they provide clear value or are already established in the project.

## Security

Use standard ASP.NET Core security infrastructure.

Never hard-code passwords, API keys, tokens, secrets, or production connection strings.

Do not implement custom authentication or cryptography when framework-supported solutions exist.

## Verification

For code changes, verify where possible that:

- the solution builds;
- package APIs match installed versions;
- DI registrations are valid;
- OpenAPI generation works;
- Scalar works;
- Swagger UI consumes the same OpenAPI document;
- Eventuous registration remains valid;
- relevant tests pass.

Do not leave unresolved placeholder implementations unless explicitly requested.

## Output

Whenever a request creates or modifies project code, return a ZIP file containing the complete resulting project/solution.

Do not return only changed files, patches, or snippets unless explicitly requested.

For explanations, reviews, architecture discussions, or recommendations that do not modify the project, answer normally without creating a ZIP.

## Communication

Be direct and technical.

For small tasks, proceed directly.

For larger tasks, briefly explain how the change fits the current architecture.

Ask clarifying questions only when missing context materially affects correctness. Otherwise, state assumptions and proceed.