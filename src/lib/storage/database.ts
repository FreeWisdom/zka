import { AsyncLocalStorage } from 'node:async_hooks';

import postgres from 'postgres';

import { getRuntimeDatabaseUrl } from '@/lib/config/env';

export type QueryResultMeta = {
  changes: number;
};

type PreparedStatement<Params extends unknown[], Row> = {
  all: (...params: Params) => Promise<Row[]>;
  get: (...params: Params) => Promise<Row | undefined>;
  run: (...params: Params) => Promise<QueryResultMeta>;
};

type DatabaseClientShape = {
  exec: (query: string) => Promise<void>;
  prepare: <Params extends unknown[], Row>(
    query: string,
  ) => PreparedStatement<Params, Row>;
  transaction: <Args extends unknown[], Result>(
    callback: (...args: Args) => Promise<Result> | Result,
  ) => (...args: Args) => Promise<Result>;
};

const globalForPostgres = globalThis as typeof globalThis & {
  postgresClient?: DatabaseClient;
  postgresSql?: ReturnType<typeof postgres>;
};

const transactionClientStorage = new AsyncLocalStorage<DatabaseClient>();
const placeholderCache = new Map<string, string>();

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

class DatabaseClient implements DatabaseClientShape {
  constructor(private readonly sqlClient: QueryExecutor) {}

  async exec(query: string) {
    await this.sqlClient.unsafe(query);
  }

  prepare<Params extends unknown[], Row>(
    query: string,
  ): PreparedStatement<Params, Row> {
    const convertedQuery = convertSqlitePlaceholders(query);

    return {
      all: async (...params: Params) => {
        const rows = await this.sqlClient.unsafe(
          convertedQuery,
          params as unknown[],
        );

        return [...rows] as Row[];
      },
      get: async (...params: Params) => {
        const rows = await this.sqlClient.unsafe(
          convertedQuery,
          params as unknown[],
        );

        return rows[0] as Row | undefined;
      },
      run: async (...params: Params) => {
        const result = await this.sqlClient.unsafe(
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
  ) {
    return async (...args: Args) =>
      (this.sqlClient as RootExecutor).begin(async (transactionSql) => {
        const transactionClient = new DatabaseClient(
          transactionSql as TransactionExecutor,
        );

        return transactionClientStorage.run(transactionClient, async () =>
          callback(...args),
        ) as Promise<Result>;
      }) as Promise<Result>;
  }
}

function createSqlClient() {
  const databaseUrl = getRuntimeDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      '未配置 DATABASE_URL 或 POSTGRES_URL，无法连接数据库',
    );
  }

  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

function getRootDatabaseClient() {
  if (!globalForPostgres.postgresSql) {
    globalForPostgres.postgresSql = createSqlClient();
    globalForPostgres.postgresClient = new DatabaseClient(
      globalForPostgres.postgresSql as unknown as RootExecutor,
    );
  }

  return globalForPostgres.postgresClient!;
}

export function getDatabase() {
  return transactionClientStorage.getStore() ?? getRootDatabaseClient();
}

export async function closeDatabaseConnections() {
  if (!globalForPostgres.postgresSql) {
    return;
  }

  await globalForPostgres.postgresSql.end({
    timeout: 5,
  });

  globalForPostgres.postgresSql = undefined;
  globalForPostgres.postgresClient = undefined;
}
