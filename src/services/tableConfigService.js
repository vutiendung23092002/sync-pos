export function createTableConfigService(dbClient) {
  return {
    getLarkTableConfig: (params) => dbClient.getLarkTableConfig(params),
    getLarkTableConfigs: (params) => dbClient.getLarkTableConfigs(params),
  };
}
