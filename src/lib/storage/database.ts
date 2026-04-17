import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import postgres from 'postgres';

import {
  getDatabasePath,
  getDatabaseProvider,
  getRuntimeDatabaseUrl,
} from '@/lib/config/env';
import { applyPendingSqliteMigrations } from '@/lib/storage/migrations';

export type QueryResultMeta = {
  changes: number;
};

type PreparedStatement<Params extends unknown[], Row> = {
  all: (...params: Params) => Promise<Row[]>;
  get: (...params: Params) => Promise<Row | undefined>;
  run: (...params: Params) => Promise<QueryResultMeta>;
};

export type DatabaseClientShape = {
  exec: (query: string) => Promise<void>;
  prepare: <Params extends unknown[], Row>(
    query: string,
  ) => PreparedStatement<Params, Row>;
  transaction: <Args extends unknown[], Result>(
    callback: (...args: Args) => Promise<Result> | Result,
  ) => (...args: Args) => Promise<Result>;
};

const globalForDatabase = globalThis as typeof globalThis & {
  postgresClient?: PostgresDatabaseClient;
  postgresSql?: ReturnType<typeof postgres>;
  sqliteClient?: SqliteDatabaseClient;
  sqliteDb?: InstanceType<typeof BetterSqlite3>;
};

const transactionClientStorage = new AsyncLocalStorage<DatabaseClientShape>();
const placeholderCache = new Map<string, string>();
const rowProxyCache = new WeakMap<object, object>();

type QueryExecutor = {
  unsafe: (query: string, params?: unknown[]) => Promise<
    Array<Record<string, unknown>> & {
      count?: number;
    }
  >;
};

type TransactionExecutor = QueryExecutor & {
  begin?: never;
};

type RootExecutor = QueryExecutor & {
  begin: <Result>(
    callback: (transactionSql: QueryExecutor) => Promise<Result>,
  ) => Promise<Result>;
};

function normalizeResultRow<Row>(row: Row): Row {
  if (!row || typeof row !== 'object') {
    return row;
  }

  const cachedRow = rowProxyCache.get(row as object);

  if (cachedRow) {
    return cachedRow as Row;
  }

  const proxiedRow = new Proxy(row as Record<string, unknown>, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return Reflect.get(target, property.toLowerCase(), receiver);
    },
    has(target, property) {
      if (typeof property !== 'string') {
        return Reflect.has(target, property);
      }

      return Reflect.has(target, property) || Reflect.has(target, property.toLowerCase());
    },
  });

  rowProxyCache.set(row as object, proxiedRow);

  return proxiedRow as Row;
}

function convertSqlitePlaceholders(query: string) {
  const cachedQuery = placeholderCache.get(query);

  if (cachedQuery) {
    return cachedQuery;
  }

  let index = 0;
  const convertedQuery = query.replace(/\?/g, () => `$${++index}`);

  placeholderCache.set(query, convertedQuery);

  return convertedQuery;
}

class PostgresDatabaseClient implements DatabaseClientShape {
  constructor(private readonly sqlClient: QueryExecutor) {}

  private getActiveQueryExecutor() {
    const activeClient = transactionClientStorage.getStore();

    if (activeClient instanceof PostgresDatabaseClient && activeClient !== this) {
      return activeClient.sqlClient;
    }

    return this.sqlClient;
  }

  async exec(query: string) {
    await this.getActiveQueryExecutor().unsafe(query);
  }

  prepare<Params extends unknown[], Row>(
    query: string,
  ): PreparedStatement<Params, Row> {
    const convertedQuery = convertSqlitePlaceholders(query);

    return {
      all: async (...params: Params) => {
        const rows = await this.getActiveQueryExecutor().unsafe(
          convertedQuery,
          params as unknown[],
        );

        return rows.map((row) => normalizeResultRow(row as Row));
      },
      get: async (...params: Params) => {
        const rows = await this.getActiveQueryExecutor().unsafe(
          convertedQuery,
          params as unknown[],
        );

        const row = rows[0];

        return row ? normalizeResultRow(row as Row) : undefined;
      },
      run: async (...params: Params) => {
        const result = await this.getActiveQueryExecutor().unsafe(
          convertedQuery,
          params as unknown[],
        );

        return {
          changes: result.count ?? 0,
        };
      },
    };
  }

  transaction<Args extends unknown[], Result>(
    callback: (...args: Args) => Promise<Result> | Result,
  ): (...args: Args) => Promise<Result> {
    return async (...args: Args) =>
      (this.sqlClient as RootExecutor).begin(async (transactionSql) => {
        const transactionClient = new PostgresDatabaseClient(
          transactionSql as TransactionExecutor,
        );

        return transactionClientStorage.run(transactionClient, async () =>
          callback(...args),
        ) as Promise<Result>;
      }) as Promise<Result>;
  }
}

class SqliteDatabaseClient implements DatabaseClientShape {
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(private readonly db: InstanceType<typeof BetterSqlite3>) {}

  async exec(query: string) {
    this.db.exec(query);
  }

  prepare<Params extends unknown[], Row>(
    query: string,
  ): PreparedStatement<Params, Row> {
    const statement = this.db.prepare(query);

    return {
      all: async (...params: Params) =>
        (statement.all(...(params as unknown[])) as Row[]).map((row) =>
          normalizeResultRow(row),
        ),
      get: async (...params: Params) => {
        const row = statement.get(...(params as unknown[])) as Row | undefined;

        return row ? normalizeResultRow(row) : undefined;
      },
      run: async (...params: Params) => {
        const result = statement.run(...(params as unknown[]));

        return {
          changes: Number(result.changes ?? 0),
        };
      },
    };
  }

  transaction<Args extends unknown[], Result>(
    callback: (...args: Args) => Promise<Result> | Result,
  ): (...args: Args) => Promise<Result> {
    return async (...args: Args) => {
      if (transactionClientStorage.getStore()) {
        return callback(...args);
      }

      const pendingTransaction = this.transactionQueue;
      let releaseTransactionQueue!: () => void;

      this.transactionQueue = new Promise<void>((resolve) => {
        releaseTransactionQueue = resolve;
      });

      await pendingTransaction;

      this.db.exec('BEGIN');

      try {
        const result: Result = await transactionClientStorage.run(
          this,
          async () => callback(...args),
        );

        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // Ignore rollback errors so the original failure is preserved.
        }

        throw error;
      } finally {
        releaseTransactionQueue();
      }
    };
  }
}

function createPostgresSqlClient() {
  const databaseUrl = getRuntimeDatabaseUrl();

  if (!databaseUrl) {
    throw new Error('未配置 DATABASE_URL 或 POSTGRES_URL，无法连接 Postgres 数据库');
  }

  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

function getResolvedDatabasePath() {
  return path.resolve(process.cwd(), getDatabasePath());
}

function createSqliteConnection() {
  const databasePath = getResolvedDatabasePath();

  fs.mkdirSync(path.dirname(databasePath), {
    recursive: true,
  });

  const sqliteDb = new BetterSqlite3(databasePath);

  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('journal_mode = WAL');
  applyPendingSqliteMigrations(sqliteDb);

  return sqliteDb;
}

function getRootDatabaseClient() {
  if (getDatabaseProvider() === 'sqlite') {
    if (!globalForDatabase.sqliteDb) {
      globalForDatabase.sqliteDb = createSqliteConnection();
      globalForDatabase.sqliteClient = new SqliteDatabaseClient(
        globalForDatabase.sqliteDb,
      );
    }

    return globalForDatabase.sqliteClient!;
  }

  if (!globalForDatabase.postgresSql) {
    globalForDatabase.postgresSql = createPostgresSqlClient();
    globalForDatabase.postgresClient = new PostgresDatabaseClient(
      globalForDatabase.postgresSql as unknown as RootExecutor,
    );
  }

  return globalForDatabase.postgresClient!;
}

export function getDatabase() {
  return transactionClientStorage.getStore() ?? getRootDatabaseClient();
}

export async function closeDatabaseConnections() {
  if (globalForDatabase.postgresSql) {
    await globalForDatabase.postgresSql.end({
      timeout: 5,
    });

    globalForDatabase.postgresSql = undefined;
    globalForDatabase.postgresClient = undefined;
  }

  if (globalForDatabase.sqliteDb) {
    globalForDatabase.sqliteDb.close();
    globalForDatabase.sqliteDb = undefined;
    globalForDatabase.sqliteClient = undefined;
  }
}
