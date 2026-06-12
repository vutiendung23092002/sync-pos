import { mapOrder } from "../mappers/mapOrder.js";
import { mapOrderItems } from "../mappers/mapOrderItem.js";
import { getLarkTextField } from "../utils/larkFields.js";
import { syncTable } from "./syncTable.js";

function collectSkus(orders) {
  return [
    ...new Set(
      orders
        .flatMap((order) => order.items || [])
        .map((item) => item?.variation_info?.product_display_id?.trim())
        .filter(Boolean),
    ),
  ];
}

function getPeriodMonth(record, fieldName) {
  const period = getLarkTextField(record.fields?.[fieldName]);
  const match = /^(\d{4})\.(\d{2})$/.exec(period || "");
  return match ? Number(match[2]) : null;
}

export function buildPeriodDestinations({
  configs,
  records,
  tableType,
  periodFieldName,
  includeEmptyDestinations = false,
}) {
  const configByMonth = new Map(
    configs.map((config) => [Number(config.month), config]),
  );
  const destinations = new Map();

  if (includeEmptyDestinations) {
    for (const config of configs) {
      const key = `${config.base_id}:${config.table_id}`;
      if (!destinations.has(key)) {
        destinations.set(key, {
          tableConfig: config,
          months: [],
          mappedRecords: [],
        });
      }
      destinations.get(key).months.push(Number(config.month));
    }
  }

  for (const record of records) {
    const month = getPeriodMonth(record, periodFieldName);
    if (month == null) {
      if (periodFieldName === "Tháng CD") continue;
      throw new Error(
        `Mapped record ${record.uniqueKey} is missing ${periodFieldName}`,
      );
    }
    const config = configByMonth.get(month);
    if (!config) {
      throw new Error(
        `Missing Lark table config: type=${tableType}, month=${month}`,
      );
    }
    const key = `${config.base_id}:${config.table_id}`;
    if (!destinations.has(key)) {
      destinations.set(key, {
        tableConfig: config,
        months: [month],
        mappedRecords: [],
      });
    } else if (!destinations.get(key).months.includes(month)) {
      destinations.get(key).months.push(month);
    }
    destinations.get(key).mappedRecords.push(record);
  }

  return [...destinations.values()];
}

function totalSummaries(summaries) {
  return summaries.reduce(
    (total, summary) => ({
      create: total.create + summary.createCount,
      update: total.update + summary.updateCount,
      delete: total.delete + summary.deleteCount,
      duplicates_deleted:
        total.duplicates_deleted + summary.duplicateDeleteCount,
    }),
    { create: 0, update: 0, delete: 0, duplicates_deleted: 0 },
  );
}

function getFieldTemplate(config, kind) {
  const templates = config.lark.schemaTemplates;
  return {
    baseId: templates.baseId,
    tableId:
      kind === "item" ? templates.itemTableId : templates.orderTableId,
  };
}

export function createSyncDay({
  config,
  posClient,
  larkClient,
  tableConfigService,
  productCostService,
  logger,
  token,
}) {
  return async function syncDay({
    date,
    dryRun = config.dryRun,
    dayIndex = 1,
    totalDays = 1,
  }) {
    const dayStartedAt = Date.now();
    const dayKeyValue = date.replaceAll("-", ".");
    const dayProgress = `${dayIndex}/${totalDays}`;

    logger.info(
      {
        date,
        day_index: dayIndex,
        total_days: totalDays,
        day_progress: dayProgress,
        dry_run: dryRun,
        step: "day_start",
      },
      `Day ${dayProgress} started`,
    );

    const categoryMap = await posClient.fetchCategories(config.pos);
    const posResult = await posClient.fetchAllOrdersByDay({
      date,
      ...config.pos,
    });
    if (posResult.complete !== true || !Array.isArray(posResult.orders)) {
      throw new Error(`POS fetch for ${date} was not confirmed complete`);
    }

    const [
      tdOrderConfigs,
      tdItemConfigs,
      cdOrderConfigs,
      cdItemConfigs,
    ] = await Promise.all([
      tableConfigService.getLarkTableConfigs({
        type: config.tableTypes.td.order,
      }),
      tableConfigService.getLarkTableConfigs({
        type: config.tableTypes.td.item,
      }),
      tableConfigService.getLarkTableConfigs({
        type: config.tableTypes.cd.order,
      }),
      tableConfigService.getLarkTableConfigs({
        type: config.tableTypes.cd.item,
      }),
    ]);

    const skus = collectSkus(posResult.orders);
    const costMap = await productCostService.getProductCostMap(skus);
    const mappedOrders = posResult.orders.map((order) => mapOrder(order));
    const mappedItems = posResult.orders.flatMap((order) =>
      mapOrderItems(order, { categoryMap, costMap }),
    );
    const tdOrderDestinations = buildPeriodDestinations({
      configs: tdOrderConfigs,
      records: mappedOrders,
      tableType: config.tableTypes.td.order,
      periodFieldName: "Tháng TD",
    });
    const tdItemDestinations = buildPeriodDestinations({
      configs: tdItemConfigs,
      records: mappedItems,
      tableType: config.tableTypes.td.item,
      periodFieldName: "Tháng TD",
    });
    const cdOrderDestinations = buildPeriodDestinations({
      configs: cdOrderConfigs,
      records: mappedOrders,
      tableType: config.tableTypes.cd.order,
      periodFieldName: "Tháng CD",
    });
    const cdItemDestinations = buildPeriodDestinations({
      configs: cdItemConfigs,
      records: mappedItems,
      tableType: config.tableTypes.cd.item,
      periodFieldName: "Tháng CD",
    });

    logger.info(
      {
        date,
        day_progress: dayProgress,
        step: "mapping_complete",
        pos_orders: posResult.orders.length,
        mapped_orders: mappedOrders.length,
        mapped_items: mappedItems.length,
        cd_order_destinations: cdOrderDestinations.length,
        cd_item_destinations: cdItemDestinations.length,
        requested_skus: skus.length,
        matched_costs: Object.keys(costMap).length,
      },
      "POS records mapped and classified",
    );

    const tdOrderSummaries = [];
    for (const destination of tdOrderDestinations) {
      tdOrderSummaries.push(
        await syncTable({
          tableName: config.tableTypes.td.order,
          larkClient,
          token,
          tableConfig: destination.tableConfig,
          dateFieldName: "Ngày tạo đơn",
          dayKeyFieldName: "Ngày TD",
          dayKeyValue,
          mappedRecords: destination.mappedRecords,
          uniqueFieldName: "Unique Key",
          legacyIdentityFieldNames: ["Mã tuỳ chỉnh", "ID"],
          deleteStatuses: ["Đã xoá"],
          dryRun,
          posFetchComplete: posResult.complete,
          fieldTemplate: getFieldTemplate(config, "order"),
          logger,
        }),
      );
    }

    const tdItemSummaries = [];
    for (const destination of tdItemDestinations) {
      tdItemSummaries.push(
        await syncTable({
          tableName: config.tableTypes.td.item,
          larkClient,
          token,
          tableConfig: destination.tableConfig,
          dateFieldName: "Thời gian tạo đơn",
          dayKeyFieldName: "Ngày TD",
          dayKeyValue,
          mappedRecords: destination.mappedRecords,
          uniqueFieldName: "Unique Key",
          legacyIdentityFieldNames: ["ID"],
          deleteStatuses: ["Đã xoá", "Đã huỷ"],
          dryRun,
          posFetchComplete: posResult.complete,
          fieldTemplate: getFieldTemplate(config, "item"),
          logger,
        }),
      );
    }

    const cdOrderSummaries = [];
    for (const destination of cdOrderDestinations) {
      cdOrderSummaries.push(
        await syncTable({
          tableName: config.tableTypes.cd.order,
          larkClient,
          token,
          tableConfig: destination.tableConfig,
          dateFieldName: "Ngày tạo đơn",
          dayKeyFieldName: "Ngày TD",
          dayKeyValue,
          mappedRecords: destination.mappedRecords,
          uniqueFieldName: "Unique Key",
          legacyIdentityFieldNames: ["Mã tuỳ chỉnh", "ID"],
          deleteStatuses: ["Đã xoá"],
          dryRun,
          posFetchComplete: posResult.complete,
          fieldTemplate: getFieldTemplate(config, "order"),
          logger,
        }),
      );
    }

    const cdItemSummaries = [];
    for (const destination of cdItemDestinations) {
      cdItemSummaries.push(
        await syncTable({
          tableName: config.tableTypes.cd.item,
          larkClient,
          token,
          tableConfig: destination.tableConfig,
          dateFieldName: "Thời gian tạo đơn",
          dayKeyFieldName: "Ngày TD",
          dayKeyValue,
          mappedRecords: destination.mappedRecords,
          uniqueFieldName: "Unique Key",
          legacyIdentityFieldNames: ["ID"],
          deleteStatuses: ["Đã xoá", "Đã huỷ"],
          dryRun,
          posFetchComplete: posResult.complete,
          fieldTemplate: getFieldTemplate(config, "item"),
          logger,
        }),
      );
    }

    const summary = {
      date,
      sync_environment: config.syncEnvironment,
      pos_orders: posResult.orders.length,
      td: {
        order: totalSummaries(tdOrderSummaries),
        item: totalSummaries(tdItemSummaries),
      },
      cd: {
        order: totalSummaries(cdOrderSummaries),
        item: totalSummaries(cdItemSummaries),
      },
      dry_run: dryRun,
      elapsed_ms: Date.now() - dayStartedAt,
      day_progress: dayProgress,
      step: "day_complete",
    };
    logger.info(summary, `Day ${dayProgress} completed`);
    return summary;
  };
}
