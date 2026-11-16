import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCase1732000000000 implements MigrationInterface {
    name = 'CreateCase1732000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "Case" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "personId" uuid NOT NULL,
                "summary" text NOT NULL,
                "status" text NOT NULL DEFAULT 'open',
                "source" text NOT NULL,
                "assignee" text,
                "note" text,
                "createdAt" timestamptz NOT NULL,
                "updatedAt" timestamptz NOT NULL,
                "resolvedAt" timestamptz,
                CONSTRAINT "PK_Case" PRIMARY KEY ("id"),
                CONSTRAINT "CHK_Case_status" CHECK ("status" IN ('open', 'in_progress', 'resolved')),
                CONSTRAINT "FK_Case_personId" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT
            )`);
        await queryRunner.query(`CREATE INDEX "IDX_Case_status_createdAt" ON "Case" ("status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_Case_personId" ON "Case" ("personId")`);
        // A lo sumo un caso automático activo por persona, aunque lleguen dos mensajes a la vez (los manuales no cuentan).
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_Case_ai_active_personId" ON "Case" ("personId") WHERE "source" = 'ai' AND "status" IN ('open', 'in_progress')`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "Case"`);
    }
}
