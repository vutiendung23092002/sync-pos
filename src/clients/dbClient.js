import pg from "pg";

const { Pool } = pg;
const DEFAULT_ADVISORY_LOCK_ID = 987654322;

function prepareConnectionString(connectionString, sslRejectUnauthorized) {
  if (sslRejectUnauthorized) return connectionString;

  const url = new URL(connectionString);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

export function createDbClient({ connectionString, sslRejectUnauthorized = true }) {
  const pool = new Pool({
    connectionString: prepareConnectionString(
      connectionString,
      sslRejectUnauthorized,
    ),
    ssl: { rejectUnauthorized: sslRejectUnauthorized },
  });
  let lockConnection = null;

  async function query(text, values = []) {
    return pool.query(text, values);
  }

  async function getLarkTableConfig({ type, month }) {
    const result = await query(
      `SELECT base_id, table_id, type, month, year
       FROM han_lark_base.tables_pos
       WHERE type = $1
         AND month = $2
       ORDER BY updated_at DESC NULLS LAST;`,
      [type, month],
    );
    if (!result.rows[0]) {
      throw new Error(`Missing Lark table config: type=${type}, month=${month}`);
    }
    if (result.rows.length > 1) {
      throw new Error(
        `Duplicate Lark table config: type=${type}, month=${month}. Year is no longer used, so keep only one row per type/month.`,
      );
    }
    return result.rows[0];
  }

  async function getLarkTableConfigs({ type }) {
    const result = await query(
      `SELECT base_id, table_id, type, month, year
       FROM han_lark_base.tables_pos
       WHERE type = $1
       ORDER BY month, updated_at DESC NULLS LAST;`,
      [type],
    );
    const byMonth = new Map();
    for (const row of result.rows) {
      const month = Number(row.month);
      if (byMonth.has(month)) {
        throw new Error(
          `Duplicate Lark table config: type=${type}, month=${month}. Year is no longer used.`,
        );
      }
      byMonth.set(month, row);
    }
    return [...byMonth.values()];
  }

  async function getProductCostMap(skus) {
    const normalized = [
      ...new Set(
        skus
          .map((sku) => sku?.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (normalized.length === 0) return {};

    const result = await query(
      `SELECT sku, cost
       FROM kiot_legiahan.product_cost
       WHERE LOWER(sku) = ANY($1::text[]);`,
      [normalized],
    );
    return Object.fromEntries(
      result.rows
        .filter((row) => row.sku)
        .map((row) => [row.sku.trim().toLowerCase(), Number(row.cost ?? 0)]),
    );
  }

  async function tryAdvisoryLock(lockId = DEFAULT_ADVISORY_LOCK_ID) {
    if (lockConnection) throw new Error("Advisory lock is already held by this process");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT pg_try_advisory_xact_lock($1) AS locked;",
        [lockId],
      );
      if (result.rows[0]?.locked !== true) {
        await client.query("ROLLBACK");
        client.release();
        return false;
      }
      lockConnection = client;
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      throw error;
    }
  }

  async function releaseAdvisoryLock() {
    if (!lockConnection) return;
    const client = lockConnection;
    lockConnection = null;
    try {
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function close() {
    await releaseAdvisoryLock();
    await pool.end();
  }

  return {
    query,
    getLarkTableConfig,
    getLarkTableConfigs,
    getProductCostMap,
    tryAdvisoryLock,
    releaseAdvisoryLock,
    close,
  };
}
