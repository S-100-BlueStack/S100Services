## Decisions

### Use feature-based structure from project start

Status: Done

Job Manager will use a feature-based frontend structure from the beginning instead of growing folders organically. The top-level app structure follows Product Manager where useful, but Job Manager separates AOI, Jobs, Map, Notices and Theme responsibilities early to avoid later structural refactoring.

### Keep mock backend behind services

Status: Done

Initial Jobs data will be provided by a mock backend, but UI code must not import mock data directly. Job UI should depend on service/domain functions so the mock backend can later be replaced by a real backend adapter.
