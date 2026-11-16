import { DataSource, QueryRunner } from 'typeorm';
import { buildDatabaseOptions, resolveDatabaseUrl } from '../database.options.js';
import { DEMO_INSTRUCTIONS, DEMO_PHONE_PREFIX, DemoData, buildDemoData } from './demo-data.js';

const ACTIVE_INSTRUCTIONS_ID = '00000000-0000-0000-0000-000000000001';
const CHUNK = 500;
const DEMO_PEOPLE = `SELECT "id" FROM "Person" WHERE "phoneNumber" LIKE '${DEMO_PHONE_PREFIX}%'`;

/** Inserta filas en bloques con parámetros (nunca concatena valores en el SQL). */
async function bulkInsert(
    runner: QueryRunner,
    table: string,
    columns: string[],
    rows: unknown[][],
    returning = '',
): Promise<Record<string, string>[]> {
    const returned: Record<string, string>[] = [];
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
        const chunk = rows.slice(offset, offset + CHUNK);
        const placeholders = chunk
            .map((_row, rowIndex) => `(${columns.map((_c, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`)
            .join(', ');
        const result = (await runner.query(
            `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${placeholders} ${returning}`,
            chunk.flat(),
        )) as Record<string, string>[];
        if (returning) returned.push(...result);
    }
    return returned;
}

/** Borra solo lo demo: personas con el prefijo, sus mensajes y casos, y las instrucciones si son las de la demo. */
async function clearDemo(runner: QueryRunner): Promise<void> {
    await runner.query(`DELETE FROM "Case" WHERE "personId" IN (${DEMO_PEOPLE})`);
    await runner.query(`DELETE FROM "Message" WHERE "personId" IN (${DEMO_PEOPLE})`);
    await runner.query(`DELETE FROM "Person" WHERE "phoneNumber" LIKE '${DEMO_PHONE_PREFIX}%'`);
    await runner.query(`DELETE FROM "Instructions" WHERE "content" = $1`, [DEMO_INSTRUCTIONS]);
}

async function insertDemo(runner: QueryRunner, data: DemoData): Promise<void> {
    const people = await bulkInsert(
        runner,
        'Person',
        ['phoneNumber', 'name', 'createdAt'],
        data.people.map((person) => [person.phoneNumber, person.name, person.createdAt]),
        'RETURNING "id", "phoneNumber"',
    );
    const idByPhone = new Map(people.map((row) => [row.phoneNumber, row.id]));
    const idOf = (phoneNumber: string): string => {
        const id = idByPhone.get(phoneNumber);
        if (!id) throw new Error(`Persona demo sin id: ${phoneNumber}`);
        return id;
    };

    await bulkInsert(
        runner,
        'Message',
        ['personId', 'role', 'content', 'providerMessageId', 'createdAt'],
        data.messages.map((message) => [idOf(message.phoneNumber), message.role, message.content, message.providerMessageId, message.createdAt]),
    );

    await bulkInsert(
        runner,
        'Case',
        ['personId', 'summary', 'status', 'source', 'assignee', 'note', 'createdAt', 'updatedAt', 'resolvedAt'],
        data.cases.map((item) => [
            idOf(item.phoneNumber),
            item.summary,
            item.status,
            item.source,
            item.assignee,
            item.note,
            item.createdAt,
            item.updatedAt,
            item.resolvedAt,
        ]),
    );

    // No pisa las instrucciones reales: solo se agregan si todavía no hay ninguna.
    await runner.query(
        `INSERT INTO "Instructions" ("id", "content") SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM "Instructions")`,
        [ACTIVE_INSTRUCTIONS_ID, DEMO_INSTRUCTIONS],
    );
}

async function main(): Promise<void> {
    const clearOnly = process.argv.includes('--clear');

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Este script es solo para desarrollo: NODE_ENV=production.');
    }

    const target = new URL(resolveDatabaseUrl(process.env));
    console.log(`Base de datos: ${target.hostname}:${target.port || '5432'}${target.pathname}`);

    const dataSource = new DataSource(buildDatabaseOptions(process.env));
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();

    try {
        await runner.startTransaction();
        try {
            await clearDemo(runner);
            if (clearOnly) {
                await runner.commitTransaction();
                console.log('Datos demo borrados.');
                return;
            }

            const data = buildDemoData();
            await insertDemo(runner, data);
            await runner.commitTransaction();
            console.log(
                `Datos demo cargados: ${data.people.length} personas, ${data.messages.length} mensajes, ${data.cases.length} casos.`,
            );
        } catch (error) {
            await runner.rollbackTransaction();
            throw error;
        }
    } finally {
        await runner.release();
        await dataSource.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
