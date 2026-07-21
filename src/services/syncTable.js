import { buildLarkUniqueIndex, dedupeMappedRecords } from "../utils/dedupe.js";
import {
  getChangedLarkFieldDetails,
  getLarkTextField,
} from "../utils/larkFields.js";
import { findLarkSchemaIssues } from "../schemas/larkSchema.js";

const CUSTOM_CODE_FIELD_NAMES = ["MÃ£ tuá»³ chá»‰nh", "Mã tuỳ chỉnh"];
const IDENTITY_FIELD_NAMES = [
  ...CUSTOM_CODE_FIELD_NAMES,
  "ID",
  "Order ID",
  "Unique Key",
];
const WRITE_ONCE_FIELD_NAMES = ["Khách mới/cũ"];

function buildUpdateFields(desiredFields, existingFields) {
  const updateFields = { ...desiredFields };

  for (const fieldName of WRITE_ONCE_FIELD_NAMES) {
    const existingValue = getLarkTextField(existingFields?.[fieldName]);
    if (existingValue?.trim()) {
      delete updateFields[fieldName];
    }
  }

  return updateFields;
}

function getFirstTextField(fields, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = getLarkTextField(fields?.[fieldName]);
    if (value) return value;
  }
  return null;
}

function buildRecordDebugIdentity({ posRecord, larkRecord, recordId }) {
  const fields = posRecord?.fields ?? larkRecord?.fields ?? {};
  const uniqueKey =
    posRecord?.uniqueKey ?? getLarkTextField(fields?.["Unique Key"]) ?? null;

  return {
    custom_code: getFirstTextField(fields, CUSTOM_CODE_FIELD_NAMES),
    identity: getFirstTextField(fields, IDENTITY_FIELD_NAMES),
    unique_key: uniqueKey,
    record_id: larkRecord?.record_id ?? recordId ?? null,
  };
}

export async function syncTable({
  tableName,
  syncDate,
  periodType,
  recordType,
  months = [],
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
  fieldSchema,
  logger,
}) {
  const startedAt = Date.now();
  const posRecords = dedupeMappedRecords(mappedRecords);
  logger?.debug(
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
  let tableFields = await larkClient.listFields({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
  });
  let { missing: missingFieldNames, wrongType } = findLarkSchemaIssues(
    tableFields,
    fieldSchema,
    requiredFieldNames,
  );
  if (wrongType.length) {
    throw new Error(
      `Lark table ${tableName} (${tableConfig.table_id}) has wrong field types: ${wrongType
        .map(
          ({ fieldName, expectedType, actualType }) =>
            `${fieldName} expected=${expectedType} actual=${actualType}`,
        )
        .join(", ")}`,
    );
  }
  if (
    missingFieldNames.length &&
    !dryRun &&
    typeof larkClient.ensureFieldsFromSchema === "function"
  ) {
    await larkClient.ensureFieldsFromSchema({
      token,
      baseId: tableConfig.base_id,
      tableId: tableConfig.table_id,
      requiredFieldNames,
      schema: fieldSchema,
    });
    tableFields = await larkClient.listFields({
      token,
      baseId: tableConfig.base_id,
      tableId: tableConfig.table_id,
    });
    const refreshedIssues = findLarkSchemaIssues(
      tableFields,
      fieldSchema,
      requiredFieldNames,
    );
    missingFieldNames = refreshedIssues.missing;
    wrongType = refreshedIssues.wrongType;
    if (wrongType.length) {
      throw new Error(
        `Lark table ${tableName} (${tableConfig.table_id}) has wrong field types after schema apply`,
      );
    }
  }
  if (missingFieldNames.length) {
    throw new Error(
      `Lark table ${tableName} (${tableConfig.table_id}) is missing fields: ${missingFieldNames.join(", ")}`,
    );
  }
  await larkClient.ensureDayKeyFormulaField({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
    dayKeyFieldName,
    dateFieldName,
    createIfMissing: !dryRun,
  });

  const larkRecords = await larkClient.searchRecordsByTextField({
    token,
    baseId: tableConfig.base_id,
    tableId: tableConfig.table_id,
    fieldName: dayKeyFieldName,
    value: dayKeyValue,
  });
  logger?.debug(
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
  const resolveLarkRecordKey = (record) => {
    const uniqueKey = getLarkTextField(record?.fields?.[uniqueFieldName]);
    if (uniqueKey) return uniqueKey;
    for (const fieldName of legacyIdentityFieldNames) {
      const value = getLarkTextField(record?.fields?.[fieldName]);
      const mappedKey = mappedLegacyIndexes.get(fieldName)?.get(value);
      if (mappedKey) return mappedKey;
    }
    return null;
  };
  const { canonicalMap, duplicateRecordIds } = buildLarkUniqueIndex(
    larkRecords,
    uniqueFieldName,
    { keyResolver: resolveLarkRecordKey },
  );
  const deleteStatusSet = new Set(deleteStatuses);
  const posKeySet = new Set(posRecords.map((record) => record.uniqueKey));
  const toCreate = [];
  const toUpdate = [];
  const toDelete = new Set(duplicateRecordIds);
  const updateDebugDetails = [];
  const deleteDebugDetails = new Map();
  let unchangedCount = 0;
  let unidentifiedLarkPreservedCount = 0;
  const setDeleteDebugDetail = (recordId, detail) => {
    if (!recordId || deleteDebugDetails.has(recordId)) return;
    deleteDebugDetails.set(recordId, detail);
  };

  for (const recordId of duplicateRecordIds) {
    const larkRecord = larkRecords.find(
      (record) => record.record_id === recordId,
    );
    setDeleteDebugDetail(recordId, {
      ...buildRecordDebugIdentity({ larkRecord, recordId }),
      reason: "duplicate",
    });
  }

  for (const record of posRecords) {
    const existing = canonicalMap.get(record.uniqueKey);
    const status = getLarkTextField(record.fields?.["Trạng thái"]);

    if (deleteStatusSet.has(status)) {
      if (existing?.record_id) {
        toDelete.add(existing.record_id);
        setDeleteDebugDetail(existing.record_id, {
          ...buildRecordDebugIdentity({
            posRecord: record,
            larkRecord: existing,
          }),
          reason: "delete_status",
          status,
        });
      }
      continue;
    }

    if (existing?.record_id) {
      const updateFields = buildUpdateFields(record.fields, existing.fields);
      const changedFieldDetails = getChangedLarkFieldDetails({
        desiredFields: updateFields,
        existingFields: existing.fields,
        fieldSchema,
      });
      const changedFieldNames = changedFieldDetails.map(
        (change) => change.field_name,
      );
      if (changedFieldNames.length) {
        toUpdate.push({ record_id: existing.record_id, fields: updateFields });
        updateDebugDetails.push({
          ...buildRecordDebugIdentity({
            posRecord: record,
            larkRecord: existing,
          }),
          changed_fields: changedFieldNames,
          changed_values: changedFieldDetails,
        });
      } else {
        unchangedCount += 1;
      }
    } else {
      toCreate.push({ fields: record.fields });
    }
  }

  if (posFetchComplete) {
    for (const larkRecord of larkRecords) {
      if (!larkRecord?.record_id || toDelete.has(larkRecord.record_id)) continue;
      const key = resolveLarkRecordKey(larkRecord);
      if (!key) {
        unidentifiedLarkPreservedCount += 1;
        continue;
      }
      if (!posKeySet.has(key)) {
        toDelete.add(larkRecord.record_id);
        setDeleteDebugDetail(larkRecord.record_id, {
          ...buildRecordDebugIdentity({ larkRecord }),
          reason: "missing_in_pos_scope",
        });
      }
    }
  } else {
    logger?.warn(
      { table_name: tableName },
      "Skipped missing-record deletion because POS fetch was incomplete",
    );
  }
  if (unidentifiedLarkPreservedCount > 0) {
    logger?.warn(
      {
        date: syncDate,
        period_type: periodType,
        record_type: recordType,
        table_name: tableName,
        table_id: tableConfig.table_id,
        months,
        unidentified_lark_preserved: unidentifiedLarkPreservedCount,
      },
      "Preserved Lark records without a resolvable identity",
    );
  }

  const deleteIds = [...toDelete];
  const updateIds = new Set(toUpdate.map((record) => record.record_id));
  const conflictingRecordIds = deleteIds.filter((recordId) =>
    updateIds.has(recordId),
  );
  if (conflictingRecordIds.length) {
    throw new Error(
      `Data integrity error: records planned for both update and delete: ${conflictingRecordIds.join(", ")}`,
    );
  }
  const planLogger =
    toCreate.length || toUpdate.length || deleteIds.length
      ? logger?.info.bind(logger)
      : logger?.debug.bind(logger);
  planLogger?.(
    {
      date: syncDate,
      period_type: periodType,
      record_type: recordType,
      table_name: tableName,
      table_id: tableConfig.table_id,
      months,
      dry_run: dryRun,
      create: toCreate.length,
      update: toUpdate.length,
      unchanged: unchangedCount,
      delete: deleteIds.length,
      duplicates_delete: duplicateRecordIds.length,
      unidentified_lark_preserved: unidentifiedLarkPreservedCount,
      pos_records: posRecords.length,
      lark_day_records: larkRecords.length,
      step: "table_plan",
    },
    "Table sync plan",
  );
  for (const detail of updateDebugDetails) {
    logger?.debug(
      {
        date: syncDate,
        period_type: periodType,
        record_type: recordType,
        table_name: tableName,
        table_id: tableConfig.table_id,
        months,
        step: "table_update_detail",
        ...detail,
      },
      "Record planned for update",
    );
  }
  for (const detail of deleteDebugDetails.values()) {
    logger?.debug(
      {
        date: syncDate,
        period_type: periodType,
        record_type: recordType,
        table_name: tableName,
        table_id: tableConfig.table_id,
        months,
        step: "table_delete_detail",
        ...detail,
      },
      "Record planned for delete",
    );
  }

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
    unchangedCount,
    deleteCount: deleteIds.length,
    duplicateDeleteCount: duplicateRecordIds.length,
    unidentifiedLarkPreservedCount,
    elapsedMs: Date.now() - startedAt,
  };
  logger?.debug(
    {
      step: "table_complete",
      table_name: tableName,
      dry_run: dryRun,
      create: summary.createCount,
      update: summary.updateCount,
      unchanged: summary.unchangedCount,
      delete: summary.deleteCount,
      elapsed_ms: summary.elapsedMs,
    },
    "Table sync completed",
  );
  return summary;
}
