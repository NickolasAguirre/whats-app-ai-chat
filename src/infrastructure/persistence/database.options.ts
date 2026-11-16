import { DataSourceOptions } from 'typeorm';
import { PersonSchema, InstructionsSchema, MessageSchema, CaseSchema } from './schemas/index.js';
import { InitSchema1730000000000 } from './migrations/1730000000000-init-schema.js';
import { CreateMessage1731000000000 } from './migrations/1731000000000-create-message.js';
import { CreateCase1732000000000 } from './migrations/1732000000000-create-case.js';

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
        entities: [PersonSchema, InstructionsSchema, MessageSchema, CaseSchema],
        migrations: [InitSchema1730000000000, CreateMessage1731000000000, CreateCase1732000000000],
        synchronize: false,
    };
}
