# Job Manager frontend

Job Manager is an ArcGIS/Vite frontend for viewing Areas of Interest and the Jobs that affect them.

The app is placed next to Product Manager in the `S100Services/src` folder and follows similar frontend architecture patterns where they fit the Job/AOI domain.

## Technology

- ArcGIS Maps SDK for JavaScript
- Vite
- Calcite Components
- Bootstrap
- JavaScript
- HTML/CSS

## Initial development assumptions

- AOIs are loaded from an ArcGIS/Esri Feature Service.
- Jobs are initially loaded from mock data.
- The mock backend must simulate loading, latency, mutation failures and cyclic Job creation.
- The frontend must not be tightly coupled to the future backend contract.

## Documentation

Project decisions, implementation tasks and progress are tracked in:

- `docs/PROJECT_TRACKER.md`

Draft backend assumptions and future contract notes are tracked in:

- `docs/BACKEND_CONTRACTS.md`
