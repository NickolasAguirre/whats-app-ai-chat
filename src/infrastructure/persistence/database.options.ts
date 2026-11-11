import { DataSourceOptions } from 'typeorm';
import { PersonSchema, InstructionsSchema } from './schemas/index.js';
import { InitSchema1730000000000 } from './migrations/1730000000000-init-schema.js';

type Env = Record<string, string | undefined>;

export function resolveDatabaseUrl(env: Env): string {
    if (env.DATABASE_URL) {
        return env.DATABASE_URL;
    }

    const user = encodeURIComponent(env.DB_USER ?? 'postgres');
    const password = encodeURIComponent(env.DB_PASSWORD ?? '');
    const host = env.DB_HOST ?? 'localhost';
    const port = env.DB_PORT ?? '5432';
    return `postgres://${user}:${password}@${host}:${port}/${env.DB_NAME ?? 'postgres'}`;
}

export function buildDatabaseOptions(env: Env): DataSourceOptions {
    return {
        type: 'postgres',
        url: resolveDatabaseUrl(env),
        uuidExtension: 'pgcrypto',
        entities: [PersonSchema, InstructionsSchema],
        migrations: [InitSchema1730000000000],
        synchronize: false,
    };
}
