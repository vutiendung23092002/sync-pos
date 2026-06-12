import {
  getMappedLarkTableConfig,
  getMappedLarkTableConfigs,
} from "../config/larkTableMapping.js";

export function createTableConfigService({
  dbClient,
  source = "mapping",
} = {}) {
  if (source === "mapping") {
    return {
      getLarkTableConfig: async (params) => getMappedLarkTableConfig(params),
      getLarkTableConfigs: async (params) => getMappedLarkTableConfigs(params),
    };
  }
  if (source !== "database") {
    throw new Error("Table config source must be mapping or database");
  }
  if (!dbClient) {
    throw new Error("dbClient is required for database table config source");
  }
  return {
    getLarkTableConfig: (params) => dbClient.getLarkTableConfig(params),
    getLarkTableConfigs: (params) => dbClient.getLarkTableConfigs(params),
  };
}
