import { createDbClient } from "./clients/dbClient.js";
import { createLarkClient } from "./clients/larkClient.js";
import { createPosClient } from "./clients/posClient.js";
import { loadConfig } from "./config.js";
import { createProductCostService } from "./services/productCostService.js";
import { createSyncDay } from "./services/syncDay.js";
import { createTableConfigService } from "./services/tableConfigService.js";
import { createLogger } from "./utils/logger.js";

async function main() {
  const syncStartedAt = Date.now();
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.logPretty);
  const dbClient = createDbClient({
    connectionString: config.databaseUrl,
    sslRejectUnauthorized: config.databaseSslRejectUnauthorized,
  });
  let locked = false;

  try {
    locked = await dbClient.tryAdvisoryLock();
    if (!locked) {
      logger.info({ event: "sync_skipped" }, "Another sync is running");
      return;
    }

    logger.info(
      {
        sync_environment: config.syncEnvironment,
        td_order_table_type: config.tableTypes.td.order,
        td_item_table_type: config.tableTypes.td.item,
        cd_order_table_type: config.tableTypes.cd.order,
        cd_item_table_type: config.tableTypes.cd.item,
        table_config_source: config.tableConfigSource,
        dry_run: config.dryRun,
        from: config.dateRange.from,
        to: config.dateRange.to,
        total_days: config.dateRange.dates.length,
        step: "sync_start",
      },
      "Starting sync",
    );

    const posClient = createPosClient({ logger });
    const larkClient = createLarkClient({ logger });
    const token = await larkClient.getTenantAccessToken(config.lark);
    const syncDay = createSyncDay({
      config,
      posClient,
      larkClient,
      tableConfigService: createTableConfigService({
        dbClient,
        source: config.tableConfigSource,
      }),
      productCostService: createProductCostService(dbClient),
      logger,
      token,
    });

    let success = 0;
    let failed = 0;
    for (const [index, date] of config.dateRange.dates.entries()) {
      try {
        await syncDay({
          date,
          dryRun: config.dryRun,
          dayIndex: index + 1,
          totalDays: config.dateRange.dates.length,
        });
        success += 1;
      } catch (error) {
        failed += 1;
        logger.error({ date, error: error.message, stack: error.stack }, "Daily sync failed");
        throw error;
      }
    }

    logger.info(
      {
        from: config.dateRange.from,
        to: config.dateRange.to,
        days: config.dateRange.dates.length,
        success,
        failed,
        elapsed_ms: Date.now() - syncStartedAt,
        step: "sync_complete",
      },
      "Sync completed",
    );
  } finally {
    if (locked) await dbClient.releaseAdvisoryLock();
    await dbClient.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      message: error.message,
      stack: error.stack,
    }),
  );
  process.exitCode = 1;
});
