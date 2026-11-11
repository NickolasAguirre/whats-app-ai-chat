import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1730000000000 implements MigrationInterface {
    name = 'InitSchema1730000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await queryRunner.query(`
            CREATE TABLE "Person" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "phoneNumber" text NOT NULL,
                "name" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_Person" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_Person_phoneNumber" UNIQUE ("phoneNumber")
            )`);
        await queryRunner.query(`
            CREATE TABLE "Instructions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "content" text NOT NULL,
                "updatedAt" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_Instructions" PRIMARY KEY ("id")
            )`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "Instructions"`);
        await queryRunner.query(`DROP TABLE "Person"`);
    }
}
