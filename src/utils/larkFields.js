export function getLarkTextField(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (entry == null) return null;
        if (typeof entry === "string" || typeof entry === "number") return String(entry);
        return entry.text ?? entry.name ?? null;
      })
      .filter((entry) => entry != null);
    return parts.length ? parts.join("") : null;
  }

  if (typeof value === "object") {
    return value.text ?? value.name ?? null;
  }
  return null;
}

export function getLarkNumberField(value) {
  if (value == null || value === "") return null;
  const raw = getLarkTextField(value) ?? value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function getLarkArrayField(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeEmptyText(value) {
  const text = getLarkTextField(value);
  return text == null || text === "" ? null : text;
}

function normalizeMultiSelect(value) {
  return getLarkArrayField(value)
    .map((item) => normalizeEmptyText(item))
    .filter(Boolean)
    .sort();
}

export function normalizeLarkFieldValue(value, fieldType) {
  if (fieldType === 2 || fieldType === 5) {
    return getLarkNumberField(value);
  }
  if (fieldType === 4) {
    return normalizeMultiSelect(value);
  }
  return normalizeEmptyText(value);
}

export function getChangedLarkFieldNames({
  desiredFields,
  existingFields,
  fieldSchema,
  ignoredFieldNames = ["Last Synced At"],
}) {
  const ignored = new Set(ignoredFieldNames);
  const schemaByName = new Map(
    fieldSchema.map((field) => [field.name, field.type]),
  );
  const changed = [];

  for (const [fieldName, desiredValue] of Object.entries(desiredFields)) {
    if (ignored.has(fieldName)) continue;
    const fieldType = schemaByName.get(fieldName);
    if (fieldType == null) {
      throw new Error(`Field ${fieldName} is not declared in Lark schema`);
    }
    const desired = normalizeLarkFieldValue(desiredValue, fieldType);
    const existing = normalizeLarkFieldValue(
      existingFields?.[fieldName],
      fieldType,
    );
    if (
      Array.isArray(desired)
        ? JSON.stringify(desired) !== JSON.stringify(existing)
        : desired !== existing
    ) {
      changed.push(fieldName);
    }
  }

  return changed;
}
