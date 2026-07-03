import { createMockJobServiceAdapter } from "./mockJobServiceAdapter.js";
import { createUnavailableHttpJobServiceAdapter } from "./unavailableHttpJobServiceAdapter.js";
import { JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapterSource.js";

export { JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapterSource.js";

export function createJobServiceAdapter({ source = JOB_SERVICE_ADAPTER_SOURCE.MOCK } = {}) {
  switch (source) {
    case JOB_SERVICE_ADAPTER_SOURCE.MOCK:
      return createMockJobServiceAdapter();
    case JOB_SERVICE_ADAPTER_SOURCE.HTTP:
      return createUnavailableHttpJobServiceAdapter();
    default:
      throw new Error(`Unsupported Job service adapter source: ${source}`);
  }
}
