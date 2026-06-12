import { buildLarkUniqueIndex, dedupeMappedRecords } from "../utils/dedupe.js";
import { getLarkTextField } from "../utils/larkFields.js";

export async function syncTable({
  tableName,
  larkClient,
  token,
  tableConfig,
  dateFieldName,
  dayKeyFieldName = "Ngày TD",
  dayKeyValue,
  mappedRecords,
  uniqueFieldName = "Unique Key",
  legacyIdentityFieldNames = [],
  deleteStatuses = [],
  dryRun = false,
  posFetchComplete = false,
  fieldTemplate,
  logger,
}) {
  const startedAt = Date.now();
  const posRecords = dedupeMappedRecords(mappedRecords);
  logger?.info(
    {
      step: "table_prepare",
      table_name: tableName,
      mapped_records: mappedRecords.length,
      deduped_pos_records: posRecords.length,
      pos_duplicates_removed: mappedRecords.length - posRecords.length,
    },
    "Table records prepared",
  );
  const requiredFieldNames = [
    ...new Set(posRecords.flatMap((record) => Object.keys(record.fields || {}))),
  ];
  await larkClient.ensureDayKeyFormulaField({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
    dayKeyFieldName,
    dateFieldName,
    createIfMissing: !dryRun,
  });
  let tableFields = await larkClient.listFields({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
  });
  const existingFieldNames = new Set(
    tableFields.map((field) => field?.field_name).filter(Boolean),
  );
  let missingFieldNames = requiredFieldNames.filter(
    (fieldName) => !existingFieldNames.has(fieldName),
  );
  if (
    missingFieldNames.length &&
    !dryRun &&
    fieldTemplate &&
    typeof larkClient.ensureFieldsFromTemplate === "function"
  ) {
    await larkClient.ensureFieldsFromTemplate({
      token,
      baseId: tableConfig.base_id,
      tableId: tableConfig.table_id,
      requiredFieldNames,
      templateBaseId: fieldTemplate.baseId,
      templateTableId: fieldTemplate.tableId,
    });
    tableFields = await larkClient.listFields({
      token,
      baseId: tableConfig.base_id,
      tableId: tableConfig.table_id,
    });
    const refreshedNames = new Set(
      tableFields.map((field) => field?.field_name).filter(Boolean),
    );
    missingFieldNames = requiredFieldNames.filter(
      (fieldName) => !refreshedNames.has(fieldName),
    );
  }
  if (missingFieldNames.length) {
    throw new Error(
      `Lark table ${tableName} (${tableConfig.table_id}) is missing fields: ${missingFieldNames.join(", ")}`,
    );
  }

  const larkRecords = await larkClient.searchRecordsByTextField({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
    fieldName: dayKeyFieldName,
    value: dayKeyValue,
  });
  logger?.info(
    {
      step: "table_scope",
      table_name: tableName,
      lark_day_records: larkRecords.length,
      day_key_field: dayKeyFieldName,
      day_key_value: dayKeyValue,
    },
    "Lark day records fetched",
  );
  const mappedLegacyIndexes = new Map(
    legacyIdentityFieldNames.map((fieldName) => {
      const index = new Map();
      for (const record of posRecords) {
        const value = getLarkTextField(record.fields?.[fieldName]);
        if (value) index.set(value, record.uniqueKey);
      }
      return [fieldName, index];
    }),
  );
  const { canonicalMap, duplicateRecordIds } = buildLarkUniqueIndex(
    larkRecords,
    uniqueFieldName,
    {
      keyResolver: (record) => {
        const uniqueKey = getLarkTextField(record?.fields?.[uniqueFieldName]);
        if (uniqueKey) return uniqueKey;
        for (const fieldName of legacyIdentityFieldNames) {
          const value = getLarkTextField(record?.fields?.[fieldName]);
          const mappedKey = mappedLegacyIndexes.get(fieldName)?.get(value);
          if (mappedKey) return mappedKey;
        }
        return null;
      },
    },
  );
  const deleteStatusSet = new Set(deleteStatuses);
  const posKeySet = new Set(posRecords.map((record) => record.uniqueKey));
  const toCreate = [];
  const toUpdate = [];
  const toDelete = new Set(duplicateRecordIds);

  for (const record of posRecords) {
    const existing = canonicalMap.get(record.uniqueKey);
    const status = getLarkTextField(record.fields?.["Trạng thái"]);

    if (deleteStatusSet.has(status)) {
      if (existing?.record_id) toDelete.add(existing.record_id);
      continue;
    }

    if (existing?.record_id) {
      toUpdate.push({ record_id: existing.record_id, fields: record.fields });
    } else {
      toCreate.push({ fields: record.fields });
    }
  }

  if (posFetchComplete) {
    for (const larkRecord of larkRecords) {
      if (!larkRecord?.record_id || toDelete.has(larkRecord.record_id)) continue;
      const key = getLarkTextField(larkRecord.fields?.[uniqueFieldName]);
      if (!key || !posKeySet.has(key)) toDelete.add(larkRecord.record_id);
    }
  } else {
    logger?.warn(
      { table_name: tableName },
      "POS fetch was not confirmed complete; missing-record deletion skipped",
    );
  }

  const deleteIds = [...toDelete];
  logger?.info(
    {
      table_name: tableName,
      dry_run: dryRun,
      create: toCreate.length,
      update: toUpdate.length,
      delete: deleteIds.length,
      duplicates_delete: duplicateRecordIds.length,
      pos_records: posRecords.length,
      lark_day_records: larkRecords.length,
      step: "table_plan",
    },
    "Lark sync plan",
  );

  if (!dryRun) {
    if (toUpdate.length) {
      await larkClient.batchUpdateRecords({
        token,
        baseId: tableConfig.base_id,
        tableId: tableConfig.table_id,
        records: toUpdate,
      });
    }
    if (toCreate.length) {
      await larkClient.batchCreateRecords({
        token,
        baseId: tableConfig.base_id,
        tableId: tableConfig.table_id,
        records: toCreate,
      });
    }
    if (deleteIds.length) {
      await larkClient.batchDeleteRecords({
        token,
        baseId: tableConfig.base_id,
        tableId: tableConfig.table_id,
        recordIds: deleteIds,
      });
    }
  }

  const summary = {
    tableName,
    posRecords: posRecords.length,
    larkRecords: larkRecords.length,
    createCount: toCreate.length,
    updateCount: toUpdate.length,
    deleteCount: deleteIds.length,
    duplicateDeleteCount: duplicateRecordIds.length,
    elapsedMs: Date.now() - startedAt,
  };
  logger?.info(
    {
      step: "table_complete",
      table_name: tableName,
      dry_run: dryRun,
      create: summary.createCount,
      update: summary.updateCount,
      delete: summary.deleteCount,
      elapsed_ms: summary.elapsedMs,
    },
    "Table sync completed",
  );
  return summary;
}
