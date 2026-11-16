import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessage1731000000000 implements MigrationInterface {
    name = 'CreateMessage1731000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "Message" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "personId" uuid NOT NULL,
                "role" text NOT NULL,
                "content" text NOT NULL,
                "providerMessageId" text,
                "createdAt" timestamptz NOT NULL,
                CONSTRAINT "PK_Message" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_Message_providerMessageId" UNIQUE ("providerMessageId"),
                CONSTRAINT "FK_Message_personId" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT
            )`);
        await queryRunner.query(`CREATE INDEX "IDX_Message_personId_createdAt" ON "Message" ("personId", "createdAt")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "Message"`);
    }
}
