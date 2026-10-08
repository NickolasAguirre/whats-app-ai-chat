# RAG Service — Fase 1 (base del servicio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el repo `rag-service` (NestJS) capaz de autenticar tenants por API key, crear colecciones, guardar ítems de texto con metadata, generar sus embeddings en segundo plano y buscarlos por similitud (pgvector).

**Architecture:** Clean Architecture con puertos y adapters, igual que `whats-app-ai-chat`: `core/domain` (entidades y puertos), `core/use-case`, `controller` (REST), `infrastructure` (Prisma + SQL crudo para `vector`, Qwen para embeddings, BullMQ sobre Redis). El tenant se deduce siempre de la API key, nunca del cliente.

**Tech Stack:** NestJS 12, TypeScript (ESM, `nodenext`), Prisma 6 + PostgreSQL con pgvector (`pgvector/pgvector:pg18`), BullMQ + Redis, SDK `openai` (modo compatible, Qwen), class-validator, Swagger, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-07-rag-service-design.md` (en el repo `whats-app-ai-chat`). Este plan implementa la **Fase 1** del spec.

## Global Constraints

- **Ubicación del repo nuevo:** `C:\Users\nicko\projects\PROYECTOS\rag-service`. TODOS los comandos de este plan se corren desde esa carpeta, salvo que se indique otra cosa.
- **Contrato público:** REST con OpenAPI (Swagger en `/docs`), autenticación con el header `X-API-Key`. El tenant sale de la key.
- **Base de datos:** imagen `pgvector/pgvector:pg18` (verificada, pgvector 0.8.7). Prisma para lo relacional; SQL crudo (`$queryRaw` / `$executeRaw`) para el tipo `vector`.
- **Cola:** BullMQ sobre Redis.
- **Estados de un ítem:** `pending`, `ready`, `failed`. La búsqueda solo considera `ready`.
- **Filtro de metadata:** igualdad exacta por contención JSON (`metadata @> filtro`).
- **Dimensión y modelo:** se fijan al crear la colección y son inmutables.
- **Regla de dependencia:** `infrastructure` y `controller` → `core/use-case` → `core/domain`. `core/domain` no importa nada de las otras capas.
- **Puertos:** `abstract class` (no `interface`), inyectados con `@Inject(Puerto)`. Bindeo con `useExisting`.
- **ESM:** todos los imports relativos terminan en `.js`. Vitest con `globals: true`.
- **Commits:** mensajes en inglés con prefijo convencional (`feat:`, `test:`, `chore:`, `docs:`). **Sin línea `Co-Authored-By`** (instrucción del usuario).
- **`CLAUDE_CONTEXT.md`** va en la raíz del repo nuevo y se agrega al `.gitignore`.
- **Puertos del host (para no chocar con el bot):** API 3100, Postgres dev 5433, Postgres test 5434, Redis dev 6380, Redis test 6381.

## Desviaciones deliberadas respecto al spec (decididas al planear)

1. `POST /collections` recibe solo `name`. El modelo de embeddings y la dimensión se toman de la configuración del servicio (hay un único adapter de embeddings por despliegue); aceptar otro modelo en la request no tendría con qué generar los vectores.
2. La columna `embedding` es `vector` **sin dimensión fija** y **sin índice ANN** por ahora. La dimensión se valida en la aplicación contra la colección. La búsqueda es exacta y siempre acotada por `collectionId` (y opcionalmente por metadata), lo cual es suficiente para esta fase. Los índices HNSW parciales por colección son parte de la Fase 4.
3. Quedan fuera de esta fase: documentos (Fase 3) y los `DELETE` y el reindexado (Fase 4).

## File Structure

```
rag-service/
├── prisma/schema.prisma, migrations/
├── docker-compose.yml, docker-compose.test.yml, Dockerfile
├── vitest.config.ts, vitest.config.int.ts, vitest.config.e2e.ts
├── test/
│   ├── env.ts, global-setup.ts
│   ├── helpers/{db.ts, fixtures.ts, fake-embedding.ts}
│   └── rag-api.e2e-spec.ts
└── src/
    ├── main.ts, app.module.ts, app.setup.ts
    ├── cli/create-tenant.ts
    ├── controller/
    │   ├── collections.controller.ts, items.controller.ts, search.controller.ts, rag-api.module.ts
    │   ├── dto/, guards/api-key.guard.ts, decorators/tenant-id.decorator.ts, filters/domain-error.filter.ts
    ├── core/
    │   ├── domain/{api-key.ts, errors.ts, entities/, ports/}
    │   └── use-case/{create-tenant, create-collection, list-collections, add-items, get-item, process-item-embedding, search-items}/
    └── infrastructure/
        ├── persistence/prisma/    # PrismaService + adapters Prisma
        ├── extern/embedding/      # QwenEmbeddingService
        └── queue/                 # BullEmbeddingQueue
```

---

## Task 1: Scaffold del repo `rag-service`

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/main.ts`, `src/app.module.ts`

**Interfaces:**
- Produces: un proyecto NestJS que compila con `pnpm build`, con Vitest listo para correr specs `*.spec.ts`.

- [ ] **Step 1: Crear la carpeta e inicializar git**

```bash
mkdir -p /c/Users/nicko/projects/PROYECTOS/rag-service
cd /c/Users/nicko/projects/PROYECTOS/rag-service
git init
```

- [ ] **Step 2: Crear `package.json`**

```json
{
  "name": "rag-service",
  "version": "0.0.1",
  "description": "Servicio RAG multi-tenant: colecciones, ítems, embeddings y búsqueda por similitud",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "oxlint src/ test/",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "vitest run",
    "test:int": "vitest run --config ./vitest.config.int.ts",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "tenant:create": "node --env-file=.env dist/cli/create-tenant.js"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", "esbuild"]
  }
}
```

- [ ] **Step 3: Instalar dependencias**

```bash
pnpm add @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 @nestjs/config@^12 @nestjs/swagger@^12 @prisma/client@^6 bullmq openai@^7 reflect-metadata rxjs class-validator class-transformer
pnpm add -D @nestjs/cli@^12 @nestjs/schematics@^12 @nestjs/testing@^12 @types/express@^5 @types/node@^24 @types/supertest supertest oxlint prettier prisma@^6 typescript@^6 vite-tsconfig-paths vitest@^4 @vitest/coverage-v8@^4
```
Expected: instalación sin errores. Si pnpm avisa que ignoró scripts de build, correr `pnpm approve-builds` y aprobar `@prisma/client`, `@prisma/engines`, `prisma` y `esbuild`.

- [ ] **Step 4: Crear `tsconfig.json`, `tsconfig.build.json` y `nest-cli.json`**

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}
```

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*spec.ts"]
}
```

```json
// nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: Crear `vitest.config.ts` y `.gitignore`**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
```

```gitignore
# .gitignore
/dist
/node_modules
/coverage
*.log
*.tsbuildinfo
.DS_Store
.idea
.vscode/*
!.vscode/settings.json

# variables de entorno
.env
.env.*.local

# contexto local de Claude Code
CLAUDE_CONTEXT.md
/.superpowers/
```

- [ ] **Step 6: Crear `src/app.module.ts` y `src/main.ts` mínimos**

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3100);
}
await bootstrap();
```

- [ ] **Step 7: Verificar que compila**

Run: `pnpm build`
Expected: termina sin errores y existe `dist/main.js`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold rag-service (NestJS, TypeScript ESM, Vitest)"
```

---

## Task 2: Base de datos (pgvector), esquema Prisma y arnés de tests de integración

**Files:**
- Create: `docker-compose.yml`, `docker-compose.test.yml`, `.env.example`
- Create: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql`
- Create: `src/infrastructure/persistence/prisma/prisma.service.ts`, `prisma.module.ts`
- Create: `vitest.config.int.ts`, `test/env.ts`, `test/global-setup.ts`, `test/helpers/db.ts`, `test/helpers/fixtures.ts`
- Test: `src/infrastructure/persistence/prisma/prisma.service.int-spec.ts`

**Interfaces:**
- Produces: `PrismaService` (extiende `PrismaClient`), `PrismaModule` (exporta `PrismaService`); helpers `truncateAll(prisma)` y `createTenantAndCollection(prisma, options?)` usados por todos los tests de integración posteriores; modelos Prisma `Tenant`, `ApiKey`, `Collection`, `Item`.

- [ ] **Step 1: Crear los archivos Docker y de entorno**

```yaml
# docker-compose.yml  (desarrollo)
services:
  db:
    image: pgvector/pgvector:pg18
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-rag}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-rag}
      POSTGRES_DB: ${DB_NAME:-rag}
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql

  redis:
    image: redis:8.10-alpine
    restart: unless-stopped
    ports:
      - "6380:6379"

volumes:
  postgres_data:
```

```yaml
# docker-compose.test.yml  (tests de integración y e2e; datos en memoria)
services:
  db-test:
    image: pgvector/pgvector:pg18
    environment:
      POSTGRES_USER: rag
      POSTGRES_PASSWORD: rag
      POSTGRES_DB: rag_test
    ports:
      - "5434:5432"
    tmpfs:
      - /var/lib/postgresql

  redis-test:
    image: redis:8.10-alpine
    ports:
      - "6381:6379"
```

```bash
# .env.example
DATABASE_URL=postgresql://rag:rag@localhost:5433/rag
REDIS_URL=redis://localhost:6380
PORT=3100

# Embeddings (Qwen vía API compatible con OpenAI). Copiá la URL base y la key del .env del bot.
QWEN_API_KEY=
QWEN_URL_BASE_OPEN_AI=
# Poné acá el modelo de embeddings de Qwen que vayas a usar; la dimensión debe ser una que ese modelo soporte.
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1024

# Cola de embeddings
EMBEDDING_JOB_ATTEMPTS=5
EMBEDDING_JOB_BACKOFF_MS=2000
```

- [ ] **Step 2: Levantar los contenedores y crear el `.env` local**

```bash
cp .env.example .env
docker compose up -d db redis
docker compose -f docker-compose.test.yml up -d
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```
Expected: cuatro contenedores corriendo (`db`, `redis`, `db-test`, `redis-test`) en los puertos 5433, 6380, 5434 y 6381.

- [ ] **Step 3: Crear `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id          String       @id @default(uuid())
  name        String
  createdAt   DateTime     @default(now())
  apiKeys     ApiKey[]
  collections Collection[]
}

model ApiKey {
  id        String    @id @default(uuid())
  tenantId  String
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  keyHash   String    @unique
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@index([tenantId])
}

model Collection {
  id             String   @id @default(uuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id])
  name           String
  embeddingModel String
  dimension      Int
  createdAt      DateTime @default(now())
  items          Item[]

  @@unique([tenantId, name])
}

enum ItemStatus {
  pending
  ready
  failed
}

model Item {
  id            String                 @id @default(uuid())
  collectionId  String
  collection    Collection             @relation(fields: [collectionId], references: [id])
  text          String
  metadata      Json                   @default("{}")
  embedding     Unsupported("vector")?
  status        ItemStatus             @default(pending)
  failureReason String?
  createdAt     DateTime               @default(now())

  @@index([collectionId, status])
}
```

- [ ] **Step 4: Crear la migración inicial agregando la extensión**

```bash
pnpm exec prisma migrate dev --create-only --name init
sed -i '1i CREATE EXTENSION IF NOT EXISTS vector;\n' prisma/migrations/*_init/migration.sql
head -5 prisma/migrations/*_init/migration.sql
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```
Expected: la primera línea del SQL es `CREATE EXTENSION IF NOT EXISTS vector;`, y `migrate deploy` aplica la migración `init` sin errores. La columna se crea como `"embedding" vector`.

- [ ] **Step 5: Crear el arnés de tests de integración**

```ts
// test/env.ts
export const TEST_ENV = {
  DATABASE_URL: 'postgresql://rag:rag@localhost:5434/rag_test',
  REDIS_URL: 'redis://localhost:6381',
  QWEN_API_KEY: 'test-key',
  QWEN_URL_BASE_OPEN_AI: 'http://localhost:1',
  EMBEDDING_MODEL: 'test-embedding',
  EMBEDDING_DIMENSIONS: '64',
};
```

```ts
// test/global-setup.ts
import { execSync } from 'node:child_process';
import { TEST_ENV } from './env.js';

export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
  });
}
```

```ts
// vitest.config.int.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TEST_ENV } from './test/env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: TEST_ENV,
    fileParallelism: false,
    testTimeout: 20000,
  },
});
```

```ts
// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TEST_ENV } from './test/env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: TEST_ENV,
    fileParallelism: false,
    testTimeout: 30000,
  },
});
```

```ts
// test/helpers/db.ts
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service.js';

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Item", "Collection", "ApiKey", "Tenant" RESTART IDENTITY CASCADE');
}
```

```ts
// test/helpers/fixtures.ts
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service.js';

export async function createTenantAndCollection(
  prisma: PrismaService,
  options: { tenantName?: string; collectionName?: string; dimension?: number } = {},
): Promise<{ tenantId: string; collectionId: string }> {
  const tenant = await prisma.tenant.create({ data: { name: options.tenantName ?? 'Tenant de prueba' } });
  const collection = await prisma.collection.create({
    data: {
      tenantId: tenant.id,
      name: options.collectionName ?? 'conversations',
      embeddingModel: 'test-embedding',
      dimension: options.dimension ?? 3,
    },
  });
  return { tenantId: tenant.id, collectionId: collection.id };
}
```

- [ ] **Step 6: Escribir el test de integración que falla**

```ts
// src/infrastructure/persistence/prisma/prisma.service.int-spec.ts
import { PrismaService } from './prisma.service.js';
import { truncateAll } from '../../../../test/helpers/db.js';
import { createTenantAndCollection } from '../../../../test/helpers/fixtures.js';

describe('PrismaService (integración con pgvector)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tiene pgvector disponible y calcula la distancia coseno', async () => {
    const rows = await prisma.$queryRaw<{ distance: number }[]>`SELECT '[1,0]'::vector <=> '[0,1]'::vector AS distance`;

    expect(Number(rows[0].distance)).toBeCloseTo(1);
  });

  it('guarda un ítem y escribe su embedding con SQL crudo', async () => {
    const { collectionId } = await createTenantAndCollection(prisma);
    const item = await prisma.item.create({ data: { collectionId, text: 'hola', metadata: { personId: 'p1' } } });
    const vector = '[0.1,0.2,0.3]';

    await prisma.$executeRaw`UPDATE "Item" SET "embedding" = ${vector}::vector, "status" = 'ready' WHERE "id" = ${item.id}`;

    const rows = await prisma.$queryRaw<{ embedding: string; status: string }[]>`SELECT "embedding"::text AS embedding, "status"::text AS status FROM "Item" WHERE "id" = ${item.id}`;
    expect(rows[0].status).toBe('ready');
    expect(rows[0].embedding).toBe('[0.1,0.2,0.3]');
  });
});
```

- [ ] **Step 7: Correr el test y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — no se puede resolver `./prisma.service.js`.

- [ ] **Step 8: Implementar `PrismaService` y `PrismaModule`**

```ts
// src/infrastructure/persistence/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
```

```ts
// src/infrastructure/persistence/prisma/prisma.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 9: Correr el test y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS (2 tests). Si falla la conexión, confirmar que `db-test` está arriba (`docker ps`).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Postgres+pgvector schema, PrismaService and integration test harness"
```

---

## Task 3: Tenants y API keys (puerto, caso de uso, adapter Prisma y CLI)

**Files:**
- Create: `src/core/domain/api-key.ts`, `src/core/domain/api-key.spec.ts`
- Create: `src/core/domain/ports/tenant-access-port/tenant-access.port.ts`
- Create: `src/core/use-case/create-tenant/create-tenant.use-case.ts`, `create-tenant.use-case.spec.ts`
- Create: `src/infrastructure/persistence/prisma/tenant-access.prisma.repository.ts`, `tenant-access.prisma.repository.int-spec.ts`, `tenant-access.module.ts`
- Create: `src/cli/create-tenant.ts`

**Interfaces:**
- Produces:
  - `generateApiKey(): string` y `hashApiKey(apiKey: string): string` (sha256 hex) en `core/domain/api-key.ts`.
  - `abstract class TenantAccessPort { createTenantWithApiKey(name: string, apiKeyHash: string): Promise<{ tenantId: string }>; findTenantIdByApiKeyHash(apiKeyHash: string): Promise<string | null>; }`
  - `CreateTenantUseCase.execute(name: string): Promise<{ tenantId: string; apiKey: string }>`
  - `TenantAccessModule` exporta `TenantAccessPort`.

- [ ] **Step 1: Escribir los tests unitarios que fallan**

```ts
// src/core/domain/api-key.spec.ts
import { generateApiKey, hashApiKey } from './api-key.js';

describe('api-key', () => {
  it('generateApiKey devuelve una key con prefijo rag_ y 64 caracteres hex', () => {
    const key = generateApiKey();

    expect(key).toMatch(/^rag_[0-9a-f]{64}$/);
  });

  it('generateApiKey no repite valores', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });

  it('hashApiKey es determinista y no devuelve la key original', () => {
    const key = 'rag_abc';

    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain('abc');
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

```ts
// src/core/use-case/create-tenant/create-tenant.use-case.spec.ts
import { CreateTenantUseCase } from './create-tenant.use-case.js';
import { hashApiKey } from '../../domain/api-key.js';

describe('CreateTenantUseCase', () => {
  const tenantsMock = { createTenantWithApiKey: vi.fn(), findTenantIdByApiKeyHash: vi.fn() };
  const useCase = new CreateTenantUseCase(tenantsMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('crea el tenant guardando solo el hash de la API key y devuelve la key en claro una vez', async () => {
    tenantsMock.createTenantWithApiKey.mockResolvedValueOnce({ tenantId: 't1' });

    const result = await useCase.execute('Cliente A');

    expect(result.tenantId).toBe('t1');
    expect(result.apiKey).toMatch(/^rag_/);
    expect(tenantsMock.createTenantWithApiKey).toHaveBeenCalledWith('Cliente A', hashApiKey(result.apiKey));
    expect(tenantsMock.createTenantWithApiKey.mock.calls[0][1]).not.toBe(result.apiKey);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar `api-key.ts`, el puerto y el caso de uso**

```ts
// src/core/domain/api-key.ts
import { createHash, randomBytes } from 'node:crypto';

export function generateApiKey(): string {
    return `rag_${randomBytes(32).toString('hex')}`;
}

export function hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
}
```

```ts
// src/core/domain/ports/tenant-access-port/tenant-access.port.ts
export abstract class TenantAccessPort {
    abstract createTenantWithApiKey(name: string, apiKeyHash: string): Promise<{ tenantId: string }>;
    abstract findTenantIdByApiKeyHash(apiKeyHash: string): Promise<string | null>;
}
```

```ts
// src/core/use-case/create-tenant/create-tenant.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantAccessPort } from '../../domain/ports/tenant-access-port/tenant-access.port.js';
import { generateApiKey, hashApiKey } from '../../domain/api-key.js';

@Injectable()
export class CreateTenantUseCase {
    constructor(@Inject(TenantAccessPort) private readonly tenants: TenantAccessPort) {}

    async execute(name: string): Promise<{ tenantId: string; apiKey: string }> {
        const apiKey = generateApiKey();
        const { tenantId } = await this.tenants.createTenantWithApiKey(name, hashApiKey(apiKey));
        return { tenantId, apiKey };
    }
}
```

- [ ] **Step 4: Correr los tests unitarios y verificar que pasan**

Run: `pnpm test`
Expected: PASS (4 tests).

- [ ] **Step 5: Escribir el test de integración del adapter (falla)**

```ts
// src/infrastructure/persistence/prisma/tenant-access.prisma.repository.int-spec.ts
import { PrismaService } from './prisma.service.js';
import { TenantAccessPrismaRepository } from './tenant-access.prisma.repository.js';
import { truncateAll } from '../../../../test/helpers/db.js';

describe('TenantAccessPrismaRepository (integración)', () => {
  const prisma = new PrismaService();
  const repository = new TenantAccessPrismaRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea el tenant con su API key y la encuentra por hash', async () => {
    const { tenantId } = await repository.createTenantWithApiKey('Cliente A', 'hash-1');

    expect(await repository.findTenantIdByApiKeyHash('hash-1')).toBe(tenantId);
  });

  it('devuelve null para un hash desconocido', async () => {
    expect(await repository.findTenantIdByApiKeyHash('no-existe')).toBeNull();
  });

  it('devuelve null para una API key revocada', async () => {
    await repository.createTenantWithApiKey('Cliente A', 'hash-1');
    await prisma.apiKey.update({ where: { keyHash: 'hash-1' }, data: { revokedAt: new Date() } });

    expect(await repository.findTenantIdByApiKeyHash('hash-1')).toBeNull();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — no existe `tenant-access.prisma.repository.js`.

- [ ] **Step 7: Implementar el adapter y su módulo**

```ts
// src/infrastructure/persistence/prisma/tenant-access.prisma.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TenantAccessPort } from '../../../core/domain/ports/tenant-access-port/tenant-access.port.js';

@Injectable()
export class TenantAccessPrismaRepository implements TenantAccessPort {
    constructor(private readonly prisma: PrismaService) {}

    async createTenantWithApiKey(name: string, apiKeyHash: string): Promise<{ tenantId: string }> {
        const tenant = await this.prisma.tenant.create({
            data: { name, apiKeys: { create: { keyHash: apiKeyHash } } },
        });
        return { tenantId: tenant.id };
    }

    async findTenantIdByApiKeyHash(apiKeyHash: string): Promise<string | null> {
        const apiKey = await this.prisma.apiKey.findFirst({
            where: { keyHash: apiKeyHash, revokedAt: null },
            select: { tenantId: true },
        });
        return apiKey?.tenantId ?? null;
    }
}
```

```ts
// src/infrastructure/persistence/prisma/tenant-access.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { TenantAccessPrismaRepository } from './tenant-access.prisma.repository.js';
import { TenantAccessPort } from '../../../core/domain/ports/tenant-access-port/tenant-access.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        TenantAccessPrismaRepository,
        { provide: TenantAccessPort, useExisting: TenantAccessPrismaRepository },
    ],
    exports: [TenantAccessPort],
})
export class TenantAccessModule {}
```

- [ ] **Step 8: Correr el test de integración y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS (5 tests en total entre los dos specs de integración).

- [ ] **Step 9: Crear el CLI para dar de alta un tenant**

```ts
// src/cli/create-tenant.ts
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service.js';
import { TenantAccessPrismaRepository } from '../infrastructure/persistence/prisma/tenant-access.prisma.repository.js';
import { CreateTenantUseCase } from '../core/use-case/create-tenant/create-tenant.use-case.js';

const name = process.argv[2];

if (!name) {
    console.error('Uso: pnpm tenant:create "<nombre del tenant>"');
    process.exit(1);
}

const prisma = new PrismaService();

try {
    await prisma.$connect();
    const useCase = new CreateTenantUseCase(new TenantAccessPrismaRepository(prisma));
    const { tenantId, apiKey } = await useCase.execute(name);
    console.log(`Tenant creado: ${tenantId}`);
    console.log(`API key (guardala ahora, no se vuelve a mostrar): ${apiKey}`);
} finally {
    await prisma.$disconnect();
}
```

- [ ] **Step 10: Verificar el CLI contra la base de desarrollo**

```bash
pnpm build
pnpm tenant:create "Tenant de prueba"
```
Expected: imprime el id del tenant y una API key que empieza con `rag_`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add tenants with hashed API keys (TenantAccessPort, Prisma adapter, create-tenant CLI)"
```

---

## Task 4: `ApiKeyGuard` y decorador `@TenantId()`

**Files:**
- Create: `src/controller/guards/api-key.guard.ts`, `api-key.guard.spec.ts`
- Create: `src/controller/decorators/tenant-id.decorator.ts`

**Interfaces:**
- Consumes: `TenantAccessPort.findTenantIdByApiKeyHash` y `hashApiKey` (Task 3).
- Produces: `ApiKeyGuard` (lee `X-API-Key`, deja `request.tenantId`), `RequestWithTenant`, y el decorador de parámetro `@TenantId()`.
- Nota de DI: un guard usado con `@UseGuards(ApiKeyGuard)` se resuelve en el módulo **del controller**, así que ese módulo debe importar `TenantAccessModule` directamente (se hace en la Task 6).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/controller/guards/api-key.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { hashApiKey } from '../../core/domain/api-key.js';

function buildContext(headers: Record<string, string>, request: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => Object.assign(request, { headers }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const tenantsMock = { createTenantWithApiKey: vi.fn(), findTenantIdByApiKeyHash: vi.fn() };
  const guard = new ApiKeyGuard(tenantsMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rechaza si falta el header X-API-Key', async () => {
    await expect(guard.canActivate(buildContext({}))).rejects.toThrow(UnauthorizedException);
    expect(tenantsMock.findTenantIdByApiKeyHash).not.toHaveBeenCalled();
  });

  it('rechaza si la API key no existe', async () => {
    tenantsMock.findTenantIdByApiKeyHash.mockResolvedValueOnce(null);

    await expect(guard.canActivate(buildContext({ 'x-api-key': 'rag_desconocida' }))).rejects.toThrow(UnauthorizedException);
  });

  it('busca por el hash (no por la key en claro) y adjunta el tenantId a la request', async () => {
    tenantsMock.findTenantIdByApiKeyHash.mockResolvedValueOnce('t1');
    const request: Record<string, unknown> = {};

    const result = await guard.canActivate(buildContext({ 'x-api-key': 'rag_valida' }, request));

    expect(result).toBe(true);
    expect(tenantsMock.findTenantIdByApiKeyHash).toHaveBeenCalledWith(hashApiKey('rag_valida'));
    expect(request.tenantId).toBe('t1');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test`
Expected: FAIL — no existe `api-key.guard.js`.

- [ ] **Step 3: Implementar el guard y el decorador**

```ts
// src/controller/guards/api-key.guard.ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { TenantAccessPort } from '../../core/domain/ports/tenant-access-port/tenant-access.port.js';
import { hashApiKey } from '../../core/domain/api-key.js';

const API_KEY_HEADER = 'x-api-key';

export interface RequestWithTenant extends Request {
    tenantId?: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(@Inject(TenantAccessPort) private readonly tenants: TenantAccessPort) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithTenant>();
        const apiKey = request.headers[API_KEY_HEADER];

        if (typeof apiKey !== 'string' || apiKey.length === 0) {
            throw new UnauthorizedException('Missing or invalid API key');
        }

        const tenantId = await this.tenants.findTenantIdByApiKeyHash(hashApiKey(apiKey));

        if (!tenantId) {
            throw new UnauthorizedException('Missing or invalid API key');
        }

        request.tenantId = tenantId;
        return true;
    }
}
```

```ts
// src/controller/decorators/tenant-id.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithTenant } from '../guards/api-key.guard.js';

export const TenantId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
    return context.switchToHttp().getRequest<RequestWithTenant>().tenantId!;
});
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test`
Expected: PASS (7 tests en total).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ApiKeyGuard and TenantId decorator"
```

---

## Task 5: Puerto de embeddings y adapter de Qwen

**Files:**
- Create: `src/core/domain/ports/embedding-port/embedding.port.ts`
- Create: `src/infrastructure/extern/embedding/qwen-embedding.service.ts`, `qwen-embedding.service.spec.ts`, `embedding.module.ts`

**Interfaces:**
- Produces:
  - `abstract class EmbeddingPort { abstract readonly model: string; abstract readonly dimension: number; abstract embed(texts: string[]): Promise<number[][]>; }` — `embed` devuelve un vector por texto, **en el mismo orden**.
  - `EmbeddingModule` exporta `EmbeddingPort`.
  - Variables de entorno: `QWEN_API_KEY`, `QWEN_URL_BASE_OPEN_AI`, `EMBEDDING_MODEL` (default `text-embedding-v4`), `EMBEDDING_DIMENSIONS` (default `1024`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/extern/embedding/qwen-embedding.service.spec.ts
import { QwenEmbeddingService } from './qwen-embedding.service.js';

function buildService(values: Record<string, string> = {}) {
  const createMock = vi.fn();
  const openai = { embeddings: { create: createMock } };
  const config = { get: (key: string) => values[key] };
  return { service: new QwenEmbeddingService(openai as any, config as any), createMock };
}

describe('QwenEmbeddingService', () => {
  it('toma modelo y dimensión de la configuración, con valores por defecto', () => {
    expect(buildService().service.model).toBe('text-embedding-v4');
    expect(buildService().service.dimension).toBe(1024);

    const custom = buildService({ EMBEDDING_MODEL: 'otro-modelo', EMBEDDING_DIMENSIONS: '512' }).service;
    expect(custom.model).toBe('otro-modelo');
    expect(custom.dimension).toBe(512);
  });

  it('pide los embeddings con el modelo y la dimensión configurados', async () => {
    const { service, createMock } = buildService({ EMBEDDING_MODEL: 'm', EMBEDDING_DIMENSIONS: '2' });
    createMock.mockResolvedValueOnce({ data: [{ index: 0, embedding: [1, 2] }] });

    const result = await service.embed(['hola']);

    expect(result).toEqual([[1, 2]]);
    expect(createMock).toHaveBeenCalledWith({ model: 'm', input: ['hola'], dimensions: 2, encoding_format: 'float' });
  });

  it('devuelve los vectores en el orden de los textos aunque la API los devuelva desordenados', async () => {
    const { service, createMock } = buildService({ EMBEDDING_DIMENSIONS: '1' });
    createMock.mockResolvedValueOnce({ data: [{ index: 1, embedding: [20] }, { index: 0, embedding: [10] }] });

    expect(await service.embed(['a', 'b'])).toEqual([[10], [20]]);
  });

  it('divide los textos en lotes de 10 (límite de la API de Qwen) y conserva el orden', async () => {
    const { service, createMock } = buildService({ EMBEDDING_DIMENSIONS: '1' });
    createMock.mockImplementation(async ({ input }: { input: string[] }) => ({
      data: input.map((text, index) => ({ index, embedding: [Number(text)] })),
    }));
    const texts = Array.from({ length: 25 }, (_, i) => String(i));

    const result = await service.embed(texts);

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it('propaga el error del proveedor', async () => {
    const { service, createMock } = buildService();
    createMock.mockRejectedValueOnce(new Error('provider down'));

    await expect(service.embed(['hola'])).rejects.toThrow('provider down');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test`
Expected: FAIL — no existe `qwen-embedding.service.js`.

- [ ] **Step 3: Implementar el puerto, el adapter y el módulo**

```ts
// src/core/domain/ports/embedding-port/embedding.port.ts
export abstract class EmbeddingPort {
    abstract readonly model: string;
    abstract readonly dimension: number;
    abstract embed(texts: string[]): Promise<number[][]>;
}
```

```ts
// src/infrastructure/extern/embedding/qwen-embedding.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingPort } from '../../../core/domain/ports/embedding-port/embedding.port.js';

const MAX_BATCH_SIZE = 10;

@Injectable()
export class QwenEmbeddingService implements EmbeddingPort {
    readonly model: string;
    readonly dimension: number;

    constructor(private readonly client: OpenAI, config: ConfigService) {
        this.model = config.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-v4';
        this.dimension = Number(config.get<string>('EMBEDDING_DIMENSIONS') ?? '1024');
    }

    async embed(texts: string[]): Promise<number[][]> {
        const vectors: number[][] = [];

        for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
            const batch = texts.slice(start, start + MAX_BATCH_SIZE);
            const response = await this.client.embeddings.create({
                model: this.model,
                input: batch,
                dimensions: this.dimension,
                encoding_format: 'float',
            });
            const ordered = [...response.data].sort((a, b) => a.index - b.index);
            vectors.push(...ordered.map((entry) => entry.embedding));
        }

        return vectors;
    }
}
```

```ts
// src/infrastructure/extern/embedding/embedding.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { QwenEmbeddingService } from './qwen-embedding.service.js';
import { EmbeddingPort } from '../../../core/domain/ports/embedding-port/embedding.port.js';

@Module({
    providers: [
        {
            provide: OpenAI,
            inject: [ConfigService],
            useFactory: (config: ConfigService) =>
                new OpenAI({
                    apiKey: config.get<string>('QWEN_API_KEY'),
                    baseURL: config.get<string>('QWEN_URL_BASE_OPEN_AI'),
                }),
        },
        QwenEmbeddingService,
        { provide: EmbeddingPort, useExisting: QwenEmbeddingService },
    ],
    exports: [EmbeddingPort],
})
export class EmbeddingModule {}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test`
Expected: PASS (12 tests en total).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add EmbeddingPort with Qwen adapter (batched, order-preserving)"
```

---

## Task 6: Colecciones (dominio, adapter Prisma y endpoints)

**Files:**
- Create: `src/core/domain/errors.ts`, `src/core/domain/entities/collection.entity.ts`
- Create: `src/core/domain/ports/collection-port/collection.port.ts`
- Create: `src/core/use-case/create-collection/create-collection.use-case.ts`, `create-collection.use-case.spec.ts`
- Create: `src/core/use-case/list-collections/list-collections.use-case.ts`, `list-collections.use-case.spec.ts`
- Create: `src/infrastructure/persistence/prisma/collection.prisma.repository.ts`, `collection.prisma.repository.int-spec.ts`, `collection-repository.module.ts`
- Create: `src/controller/dto/create-collection.dto.ts`, `src/controller/collections.controller.ts`, `collections.controller.spec.ts`
- Create: `src/controller/filters/domain-error.filter.ts`, `domain-error.filter.spec.ts`
- Create: `src/controller/rag-api.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `EmbeddingPort` (Task 5), `TenantAccessModule` y `ApiKeyGuard`/`@TenantId()` (Tasks 3-4).
- Produces:
  - Errores de dominio: `DomainError`, `CollectionNotFoundError(name)`, `CollectionAlreadyExistsError(name)`, `ItemNotFoundError(id)`, todos con `.message` en español.
  - `Collection { id, tenantId, name, embeddingModel, dimension, createdAt }`.
  - `abstract class CollectionRepositoryPort { create(tenantId, data: NewCollection): Promise<Collection>; list(tenantId): Promise<Collection[]>; findByName(tenantId, name): Promise<Collection | null>; }` con `NewCollection { name; embeddingModel; dimension }`. `create` lanza `CollectionAlreadyExistsError` si el nombre ya existe en ese tenant.
  - `CreateCollectionUseCase.execute(tenantId, name): Promise<Collection>`; `ListCollectionsUseCase.execute(tenantId): Promise<Collection[]>`.
  - `CollectionRepositoryModule` exporta `CollectionRepositoryPort`.
  - Endpoints: `POST /collections` (201) y `GET /collections`.
  - `RagApiModule` (se amplía en las Tasks 9 y 10).

- [ ] **Step 1: Crear errores y entidad (sin tests: son tipos y clases triviales que se cubren desde los casos de uso)**

```ts
// src/core/domain/errors.ts
export class DomainError extends Error {}

export class CollectionNotFoundError extends DomainError {
    constructor(name: string) {
        super(`La colección "${name}" no existe`);
    }
}

export class CollectionAlreadyExistsError extends DomainError {
    constructor(name: string) {
        super(`Ya existe una colección llamada "${name}"`);
    }
}

export class ItemNotFoundError extends DomainError {
    constructor(id: string) {
        super(`El ítem "${id}" no existe`);
    }
}
```

```ts
// src/core/domain/entities/collection.entity.ts
export class Collection {
    id: string;
    tenantId: string;
    name: string;
    embeddingModel: string;
    dimension: number;
    createdAt: Date;
}
```

```ts
// src/core/domain/ports/collection-port/collection.port.ts
import { Collection } from '../../entities/collection.entity.js';

export interface NewCollection {
    name: string;
    embeddingModel: string;
    dimension: number;
}

export abstract class CollectionRepositoryPort {
    abstract create(tenantId: string, data: NewCollection): Promise<Collection>;
    abstract list(tenantId: string): Promise<Collection[]>;
    abstract findByName(tenantId: string, name: string): Promise<Collection | null>;
}
```

- [ ] **Step 2: Escribir los tests de los casos de uso (fallan)**

```ts
// src/core/use-case/create-collection/create-collection.use-case.spec.ts
import { CreateCollectionUseCase } from './create-collection.use-case.js';

describe('CreateCollectionUseCase', () => {
  const collectionsMock = { create: vi.fn(), list: vi.fn(), findByName: vi.fn() };
  const embeddingMock = { model: 'modelo-x', dimension: 1024, embed: vi.fn() };
  const useCase = new CreateCollectionUseCase(collectionsMock, embeddingMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('crea la colección fijando el modelo y la dimensión del servicio de embeddings', async () => {
    const created = { id: 'c1', tenantId: 't1', name: 'conversations', embeddingModel: 'modelo-x', dimension: 1024, createdAt: new Date() };
    collectionsMock.create.mockResolvedValueOnce(created);

    const result = await useCase.execute('t1', 'conversations');

    expect(result).toBe(created);
    expect(collectionsMock.create).toHaveBeenCalledWith('t1', {
      name: 'conversations',
      embeddingModel: 'modelo-x',
      dimension: 1024,
    });
  });
});
```

```ts
// src/core/use-case/list-collections/list-collections.use-case.spec.ts
import { ListCollectionsUseCase } from './list-collections.use-case.js';

describe('ListCollectionsUseCase', () => {
  const collectionsMock = { create: vi.fn(), list: vi.fn(), findByName: vi.fn() };
  const useCase = new ListCollectionsUseCase(collectionsMock);

  it('lista solo las colecciones del tenant indicado', async () => {
    collectionsMock.list.mockResolvedValueOnce([{ id: 'c1' }]);

    const result = await useCase.execute('t1');

    expect(result).toEqual([{ id: 'c1' }]);
    expect(collectionsMock.list).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — no existen los casos de uso.

- [ ] **Step 4: Implementar los casos de uso**

```ts
// src/core/use-case/create-collection/create-collection.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { Collection } from '../../domain/entities/collection.entity.js';
import { CollectionRepositoryPort } from '../../domain/ports/collection-port/collection.port.js';
import { EmbeddingPort } from '../../domain/ports/embedding-port/embedding.port.js';

@Injectable()
export class CreateCollectionUseCase {
    constructor(
        @Inject(CollectionRepositoryPort) private readonly collections: CollectionRepositoryPort,
        @Inject(EmbeddingPort) private readonly embedding: EmbeddingPort,
    ) {}

    async execute(tenantId: string, name: string): Promise<Collection> {
        return this.collections.create(tenantId, {
            name,
            embeddingModel: this.embedding.model,
            dimension: this.embedding.dimension,
        });
    }
}
```

```ts
// src/core/use-case/list-collections/list-collections.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { Collection } from '../../domain/entities/collection.entity.js';
import { CollectionRepositoryPort } from '../../domain/ports/collection-port/collection.port.js';

@Injectable()
export class ListCollectionsUseCase {
    constructor(@Inject(CollectionRepositoryPort) private readonly collections: CollectionRepositoryPort) {}

    async execute(tenantId: string): Promise<Collection[]> {
        return this.collections.list(tenantId);
    }
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Escribir el test de integración del adapter (falla)**

```ts
// src/infrastructure/persistence/prisma/collection.prisma.repository.int-spec.ts
import { PrismaService } from './prisma.service.js';
import { CollectionPrismaRepository } from './collection.prisma.repository.js';
import { CollectionAlreadyExistsError } from '../../../core/domain/errors.js';
import { truncateAll } from '../../../../test/helpers/db.js';

describe('CollectionPrismaRepository (integración)', () => {
  const prisma = new PrismaService();
  const repository = new CollectionPrismaRepository(prisma);
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    tenantA = (await prisma.tenant.create({ data: { name: 'A' } })).id;
    tenantB = (await prisma.tenant.create({ data: { name: 'B' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const data = { name: 'conversations', embeddingModel: 'm', dimension: 3 };

  it('crea una colección y la encuentra por nombre', async () => {
    const created = await repository.create(tenantA, data);

    expect(created).toMatchObject({ tenantId: tenantA, name: 'conversations', embeddingModel: 'm', dimension: 3 });
    expect(await repository.findByName(tenantA, 'conversations')).toMatchObject({ id: created.id });
  });

  it('lanza CollectionAlreadyExistsError si el nombre ya existe en el mismo tenant', async () => {
    await repository.create(tenantA, data);

    await expect(repository.create(tenantA, data)).rejects.toThrow(CollectionAlreadyExistsError);
  });

  it('permite el mismo nombre en tenants distintos', async () => {
    await repository.create(tenantA, data);

    await expect(repository.create(tenantB, data)).resolves.toBeDefined();
  });

  it('aísla los datos por tenant: no lista ni encuentra colecciones de otro tenant', async () => {
    await repository.create(tenantA, data);

    expect(await repository.list(tenantB)).toEqual([]);
    expect(await repository.findByName(tenantB, 'conversations')).toBeNull();
    expect(await repository.list(tenantA)).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Correr el test de integración y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — no existe `collection.prisma.repository.js`.

- [ ] **Step 8: Implementar el adapter y su módulo**

```ts
// src/infrastructure/persistence/prisma/collection.prisma.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { Collection } from '../../../core/domain/entities/collection.entity.js';
import { CollectionAlreadyExistsError } from '../../../core/domain/errors.js';
import { CollectionRepositoryPort, NewCollection } from '../../../core/domain/ports/collection-port/collection.port.js';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class CollectionPrismaRepository implements CollectionRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async create(tenantId: string, data: NewCollection): Promise<Collection> {
        try {
            const row = await this.prisma.collection.create({ data: { tenantId, ...data } });
            return toCollection(row);
        } catch (error) {
            if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
                throw new CollectionAlreadyExistsError(data.name);
            }
            throw error;
        }
    }

    async list(tenantId: string): Promise<Collection[]> {
        const rows = await this.prisma.collection.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
        return rows.map(toCollection);
    }

    async findByName(tenantId: string, name: string): Promise<Collection | null> {
        const row = await this.prisma.collection.findUnique({ where: { tenantId_name: { tenantId, name } } });
        return row ? toCollection(row) : null;
    }
}

function toCollection(row: Collection): Collection {
    return {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        embeddingModel: row.embeddingModel,
        dimension: row.dimension,
        createdAt: row.createdAt,
    };
}
```

```ts
// src/infrastructure/persistence/prisma/collection-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { CollectionPrismaRepository } from './collection.prisma.repository.js';
import { CollectionRepositoryPort } from '../../../core/domain/ports/collection-port/collection.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        CollectionPrismaRepository,
        { provide: CollectionRepositoryPort, useExisting: CollectionPrismaRepository },
    ],
    exports: [CollectionRepositoryPort],
})
export class CollectionRepositoryModule {}
```

- [ ] **Step 9: Correr el test de integración y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS.

- [ ] **Step 10: Escribir los tests del controller y del filtro de errores (fallan)**

```ts
// src/controller/collections.controller.spec.ts
import { CollectionsController } from './collections.controller.js';

describe('CollectionsController', () => {
  const createMock = { execute: vi.fn() };
  const listMock = { execute: vi.fn() };
  const controller = new CollectionsController(createMock as any, listMock as any);
  const collection = { id: 'c1', tenantId: 't1', name: 'conversations', embeddingModel: 'm', dimension: 3, createdAt: new Date('2026-10-07T00:00:00Z') };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('createCollection usa el tenantId del guard y no expone el tenantId en la respuesta', async () => {
    createMock.execute.mockResolvedValueOnce(collection);

    const result = await controller.createCollection('t1', { name: 'conversations' });

    expect(createMock.execute).toHaveBeenCalledWith('t1', 'conversations');
    expect(result).toEqual({ id: 'c1', name: 'conversations', embeddingModel: 'm', dimension: 3, createdAt: collection.createdAt });
  });

  it('listCollections devuelve las colecciones del tenant', async () => {
    listMock.execute.mockResolvedValueOnce([collection]);

    const result = await controller.listCollections('t1');

    expect(listMock.execute).toHaveBeenCalledWith('t1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('conversations');
  });
});
```

```ts
// src/controller/filters/domain-error.filter.spec.ts
import { ArgumentsHost } from '@nestjs/common';
import { DomainErrorFilter } from './domain-error.filter.js';
import { CollectionAlreadyExistsError, CollectionNotFoundError, DomainError, ItemNotFoundError } from '../../core/domain/errors.js';

function run(error: DomainError) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  new DomainErrorFilter().catch(error, host);
  return { status, json };
}

describe('DomainErrorFilter', () => {
  it('responde 404 cuando no existe la colección o el ítem', () => {
    expect(run(new CollectionNotFoundError('x')).status).toHaveBeenCalledWith(404);
    expect(run(new ItemNotFoundError('x')).status).toHaveBeenCalledWith(404);
  });

  it('responde 409 cuando la colección ya existe', () => {
    const { status, json } = run(new CollectionAlreadyExistsError('conversations'));

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ statusCode: 409, message: 'Ya existe una colección llamada "conversations"' });
  });

  it('responde 400 ante cualquier otro error de dominio', () => {
    expect(run(new DomainError('otro')).status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 11: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — no existen controller ni filtro.

- [ ] **Step 12: Implementar DTO, controller, filtro y módulo**

```ts
// src/controller/dto/create-collection.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateCollectionDto {
    @ApiProperty({ example: 'conversations', description: 'Minúsculas, números, "-" y "_"; hasta 63 caracteres' })
    @IsString()
    @Matches(/^[a-z0-9][a-z0-9_-]{0,62}$/, { message: 'name debe usar minúsculas, números, "-" o "_" (máx. 63 caracteres)' })
    name: string;
}
```

```ts
// src/controller/collections.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { TenantId } from './decorators/tenant-id.decorator.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { CreateCollectionUseCase } from '../core/use-case/create-collection/create-collection.use-case.js';
import { ListCollectionsUseCase } from '../core/use-case/list-collections/list-collections.use-case.js';
import { Collection } from '../core/domain/entities/collection.entity.js';

function toResponse(collection: Collection) {
    return {
        id: collection.id,
        name: collection.name,
        embeddingModel: collection.embeddingModel,
        dimension: collection.dimension,
        createdAt: collection.createdAt,
    };
}

@ApiTags('collections')
@ApiSecurity('api-key')
@Controller('collections')
@UseGuards(ApiKeyGuard)
export class CollectionsController {
    constructor(
        private readonly createCollectionUseCase: CreateCollectionUseCase,
        private readonly listCollectionsUseCase: ListCollectionsUseCase,
    ) {}

    @Post()
    async createCollection(@TenantId() tenantId: string, @Body() dto: CreateCollectionDto) {
        return toResponse(await this.createCollectionUseCase.execute(tenantId, dto.name));
    }

    @Get()
    async listCollections(@TenantId() tenantId: string) {
        const collections = await this.listCollectionsUseCase.execute(tenantId);
        return collections.map(toResponse);
    }
}
```

```ts
// src/controller/filters/domain-error.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import {
    CollectionAlreadyExistsError,
    CollectionNotFoundError,
    DomainError,
    ItemNotFoundError,
} from '../../core/domain/errors.js';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
    catch(error: DomainError, host: ArgumentsHost) {
        const response = host.switchToHttp().getResponse<Response>();
        const status = this.statusFor(error);
        response.status(status).json({ statusCode: status, message: error.message });
    }

    private statusFor(error: DomainError): number {
        if (error instanceof CollectionNotFoundError || error instanceof ItemNotFoundError) return 404;
        if (error instanceof CollectionAlreadyExistsError) return 409;
        return 400;
    }
}
```

```ts
// src/controller/rag-api.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CollectionsController } from './collections.controller.js';
import { DomainErrorFilter } from './filters/domain-error.filter.js';
import { CreateCollectionUseCase } from '../core/use-case/create-collection/create-collection.use-case.js';
import { ListCollectionsUseCase } from '../core/use-case/list-collections/list-collections.use-case.js';
import { TenantAccessModule } from '../infrastructure/persistence/prisma/tenant-access.module.js';
import { CollectionRepositoryModule } from '../infrastructure/persistence/prisma/collection-repository.module.js';
import { EmbeddingModule } from '../infrastructure/extern/embedding/embedding.module.js';

@Module({
    imports: [TenantAccessModule, CollectionRepositoryModule, EmbeddingModule],
    controllers: [CollectionsController],
    providers: [
        CreateCollectionUseCase,
        ListCollectionsUseCase,
        { provide: APP_FILTER, useClass: DomainErrorFilter },
    ],
})
export class RagApiModule {}
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagApiModule } from './controller/rag-api.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RagApiModule],
})
export class AppModule {}
```

- [ ] **Step 13: Correr todos los tests y compilar**

Run: `pnpm test && pnpm test:int && pnpm build`
Expected: todo PASS y el build termina sin errores.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add collections (domain, Prisma adapter, REST endpoints, domain error filter)"
```

---

## Task 7: Persistencia de ítems (crear pendientes, leer, marcar listo/fallido)

**Files:**
- Create: `src/core/domain/entities/item.entity.ts`
- Create: `src/core/domain/ports/item-port/item.port.ts`
- Create: `src/infrastructure/persistence/prisma/item.prisma.repository.ts`, `item.prisma.repository.int-spec.ts`, `item-repository.module.ts`

**Interfaces:**
- Produces:
  - `type ItemStatus = 'pending' | 'ready' | 'failed'`; `Item { id, collectionId, text, metadata: Record<string, unknown>, status: ItemStatus, createdAt }`; `ItemToEmbed { id, text, dimension }`; `SearchHit { id, text, metadata, score }`.
  - `abstract class ItemRepositoryPort`:
    - `createPending(collectionId: string, items: NewItem[]): Promise<Item[]>` con `NewItem { text: string; metadata: Record<string, unknown> }`
    - `findById(collectionId: string, itemId: string): Promise<Item | null>`
    - `findToEmbed(itemId: string): Promise<ItemToEmbed | null>` — `null` si no existe **o si ya no está `pending`**.
    - `markReady(itemId: string, embedding: number[]): Promise<void>`
    - `markFailed(itemId: string, reason: string): Promise<void>`
  - `ItemRepositoryModule` exporta `ItemRepositoryPort` (en la Task 10 también exportará `ItemSearchPort`).

- [ ] **Step 1: Crear entidades y puerto**

```ts
// src/core/domain/entities/item.entity.ts
export type ItemStatus = 'pending' | 'ready' | 'failed';

export class Item {
    id: string;
    collectionId: string;
    text: string;
    metadata: Record<string, unknown>;
    status: ItemStatus;
    createdAt: Date;
}

export class ItemToEmbed {
    id: string;
    text: string;
    dimension: number;
}

export class SearchHit {
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    score: number;
}
```

```ts
// src/core/domain/ports/item-port/item.port.ts
import { Item, ItemToEmbed } from '../../entities/item.entity.js';

export interface NewItem {
    text: string;
    metadata: Record<string, unknown>;
}

export abstract class ItemRepositoryPort {
    abstract createPending(collectionId: string, items: NewItem[]): Promise<Item[]>;
    abstract findById(collectionId: string, itemId: string): Promise<Item | null>;
    abstract findToEmbed(itemId: string): Promise<ItemToEmbed | null>;
    abstract markReady(itemId: string, embedding: number[]): Promise<void>;
    abstract markFailed(itemId: string, reason: string): Promise<void>;
}
```

- [ ] **Step 2: Escribir el test de integración (falla)**

```ts
// src/infrastructure/persistence/prisma/item.prisma.repository.int-spec.ts
import { PrismaService } from './prisma.service.js';
import { ItemPrismaRepository } from './item.prisma.repository.js';
import { truncateAll } from '../../../../test/helpers/db.js';
import { createTenantAndCollection } from '../../../../test/helpers/fixtures.js';

describe('ItemPrismaRepository (integración)', () => {
  const prisma = new PrismaService();
  const repository = new ItemPrismaRepository(prisma);
  let collectionId: string;
  let otherCollectionId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    ({ collectionId } = await createTenantAndCollection(prisma, { dimension: 3 }));
    ({ collectionId: otherCollectionId } = await createTenantAndCollection(prisma, { tenantName: 'Otro', dimension: 3 }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('createPending guarda los ítems en estado pending y devuelve sus ids', async () => {
    const items = await repository.createPending(collectionId, [
      { text: 'hola', metadata: { personId: 'p1' } },
      { text: 'chau', metadata: {} },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ collectionId, text: 'hola', metadata: { personId: 'p1' }, status: 'pending' });
    expect(items[0].id).toBeDefined();
  });

  it('findById solo encuentra el ítem dentro de su propia colección', async () => {
    const [item] = await repository.createPending(collectionId, [{ text: 'hola', metadata: {} }]);

    expect(await repository.findById(collectionId, item.id)).toMatchObject({ id: item.id });
    expect(await repository.findById(otherCollectionId, item.id)).toBeNull();
  });

  it('findToEmbed devuelve el texto y la dimensión de la colección mientras el ítem está pending', async () => {
    const [item] = await repository.createPending(collectionId, [{ text: 'hola', metadata: {} }]);

    expect(await repository.findToEmbed(item.id)).toEqual({ id: item.id, text: 'hola', dimension: 3 });
  });

  it('markReady guarda el embedding, cambia el estado y findToEmbed deja de devolver el ítem', async () => {
    const [item] = await repository.createPending(collectionId, [{ text: 'hola', metadata: {} }]);

    await repository.markReady(item.id, [0.1, 0.2, 0.3]);

    const rows = await prisma.$queryRaw<{ embedding: string; status: string }[]>`SELECT "embedding"::text AS embedding, "status"::text AS status FROM "Item" WHERE "id" = ${item.id}`;
    expect(rows[0]).toEqual({ embedding: '[0.1,0.2,0.3]', status: 'ready' });
    expect(await repository.findToEmbed(item.id)).toBeNull();
  });

  it('markFailed cambia el estado a failed y guarda el motivo', async () => {
    const [item] = await repository.createPending(collectionId, [{ text: 'hola', metadata: {} }]);

    await repository.markFailed(item.id, 'provider down');

    const row = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe('provider down');
  });

  it('findToEmbed devuelve null para un ítem inexistente', async () => {
    expect(await repository.findToEmbed('no-existe')).toBeNull();
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — no existe `item.prisma.repository.js`.

- [ ] **Step 4: Implementar el adapter y su módulo**

```ts
// src/infrastructure/persistence/prisma/item.prisma.repository.ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { Item, ItemStatus, ItemToEmbed } from '../../../core/domain/entities/item.entity.js';
import { ItemRepositoryPort, NewItem } from '../../../core/domain/ports/item-port/item.port.js';

const MAX_FAILURE_REASON_LENGTH = 500;

@Injectable()
export class ItemPrismaRepository implements ItemRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async createPending(collectionId: string, items: NewItem[]): Promise<Item[]> {
        const rows = await this.prisma.$transaction(
            items.map((item) =>
                this.prisma.item.create({
                    data: { collectionId, text: item.text, metadata: item.metadata as Prisma.InputJsonValue },
                }),
            ),
        );
        return rows.map(toItem);
    }

    async findById(collectionId: string, itemId: string): Promise<Item | null> {
        const row = await this.prisma.item.findFirst({ where: { id: itemId, collectionId } });
        return row ? toItem(row) : null;
    }

    async findToEmbed(itemId: string): Promise<ItemToEmbed | null> {
        const row = await this.prisma.item.findUnique({
            where: { id: itemId },
            select: { id: true, text: true, status: true, collection: { select: { dimension: true } } },
        });

        if (!row || row.status !== 'pending') {
            return null;
        }

        return { id: row.id, text: row.text, dimension: row.collection.dimension };
    }

    async markReady(itemId: string, embedding: number[]): Promise<void> {
        const vector = toVectorLiteral(embedding);
        await this.prisma.$executeRaw`UPDATE "Item" SET "embedding" = ${vector}::vector, "status" = 'ready', "failureReason" = NULL WHERE "id" = ${itemId}`;
    }

    async markFailed(itemId: string, reason: string): Promise<void> {
        await this.prisma.item.update({
            where: { id: itemId },
            data: { status: 'failed', failureReason: reason.slice(0, MAX_FAILURE_REASON_LENGTH) },
        });
    }
}

export function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
}

function toItem(row: { id: string; collectionId: string; text: string; metadata: unknown; status: string; createdAt: Date }): Item {
    return {
        id: row.id,
        collectionId: row.collectionId,
        text: row.text,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        status: row.status as ItemStatus,
        createdAt: row.createdAt,
    };
}
```

```ts
// src/infrastructure/persistence/prisma/item-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { ItemPrismaRepository } from './item.prisma.repository.js';
import { ItemRepositoryPort } from '../../../core/domain/ports/item-port/item.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        ItemPrismaRepository,
        { provide: ItemRepositoryPort, useExisting: ItemPrismaRepository },
    ],
    exports: [ItemRepositoryPort],
})
export class ItemRepositoryModule {}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS (los 6 tests nuevos y los anteriores).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add item persistence (pending/ready/failed, embedding written via raw SQL)"
```

---

## Task 8: Cola de embeddings (caso de uso, adapter BullMQ y reintentos)

**Files:**
- Create: `src/core/domain/ports/embedding-queue-port/embedding-queue.port.ts`
- Create: `src/core/use-case/process-item-embedding/process-item-embedding.use-case.ts`, `process-item-embedding.use-case.spec.ts`
- Create: `src/infrastructure/queue/redis-connection.ts`, `redis-connection.spec.ts`
- Create: `src/infrastructure/queue/bull-embedding-queue.ts`, `bull-embedding-queue.int-spec.ts`, `embedding-queue.module.ts`

**Interfaces:**
- Consumes: `ItemRepositoryPort.findToEmbed/markReady/markFailed` (Task 7), `EmbeddingPort` (Task 5).
- Produces:
  - `abstract class EmbeddingQueuePort { abstract enqueue(itemIds: string[]): Promise<void>; }`
  - `ProcessItemEmbeddingUseCase.execute(itemId: string): Promise<void>` (lanza si falla, para que BullMQ reintente) y `.fail(itemId: string, reason: string): Promise<void>`.
  - `EmbeddingQueueModule` exporta `EmbeddingQueuePort`. Variables: `EMBEDDING_QUEUE_NAME` (default `item-embedding`), `EMBEDDING_JOB_ATTEMPTS` (default 5), `EMBEDDING_JOB_BACKOFF_MS` (default 2000).

- [ ] **Step 1: Escribir los tests unitarios (fallan)**

```ts
// src/core/use-case/process-item-embedding/process-item-embedding.use-case.spec.ts
import { ProcessItemEmbeddingUseCase } from './process-item-embedding.use-case.js';

describe('ProcessItemEmbeddingUseCase', () => {
  const itemsMock = { createPending: vi.fn(), findById: vi.fn(), findToEmbed: vi.fn(), markReady: vi.fn(), markFailed: vi.fn() };
  const embeddingMock = { model: 'm', dimension: 3, embed: vi.fn() };
  const useCase = new ProcessItemEmbeddingUseCase(itemsMock, embeddingMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('genera el embedding del texto y marca el ítem como listo', async () => {
    itemsMock.findToEmbed.mockResolvedValueOnce({ id: 'i1', text: 'hola', dimension: 3 });
    embeddingMock.embed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    await useCase.execute('i1');

    expect(embeddingMock.embed).toHaveBeenCalledWith(['hola']);
    expect(itemsMock.markReady).toHaveBeenCalledWith('i1', [0.1, 0.2, 0.3]);
  });

  it('no hace nada si el ítem ya no está pendiente (el job es idempotente)', async () => {
    itemsMock.findToEmbed.mockResolvedValueOnce(null);

    await useCase.execute('i1');

    expect(embeddingMock.embed).not.toHaveBeenCalled();
    expect(itemsMock.markReady).not.toHaveBeenCalled();
  });

  it('lanza error si la dimensión del embedding no coincide con la de la colección', async () => {
    itemsMock.findToEmbed.mockResolvedValueOnce({ id: 'i1', text: 'hola', dimension: 3 });
    embeddingMock.embed.mockResolvedValueOnce([[0.1, 0.2]]);

    await expect(useCase.execute('i1')).rejects.toThrow('dimension');
    expect(itemsMock.markReady).not.toHaveBeenCalled();
  });

  it('propaga el error del proveedor para que la cola reintente', async () => {
    itemsMock.findToEmbed.mockResolvedValueOnce({ id: 'i1', text: 'hola', dimension: 3 });
    embeddingMock.embed.mockRejectedValueOnce(new Error('provider down'));

    await expect(useCase.execute('i1')).rejects.toThrow('provider down');
  });

  it('fail marca el ítem como fallido con el motivo', async () => {
    await useCase.fail('i1', 'provider down');

    expect(itemsMock.markFailed).toHaveBeenCalledWith('i1', 'provider down');
  });
});
```

```ts
// src/infrastructure/queue/redis-connection.spec.ts
import { parseRedisUrl } from './redis-connection.js';

describe('parseRedisUrl', () => {
  it('extrae host y puerto', () => {
    expect(parseRedisUrl('redis://localhost:6380')).toMatchObject({ host: 'localhost', port: 6380 });
  });

  it('usa el puerto 6379 por defecto e incluye la contraseña si existe', () => {
    expect(parseRedisUrl('redis://:secreto@redis')).toMatchObject({ host: 'redis', port: 6379, password: 'secreto' });
  });

  it('desactiva los reintentos por request (requisito de los workers de BullMQ)', () => {
    expect(parseRedisUrl('redis://localhost').maxRetriesPerRequest).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar puerto, caso de uso y helper de conexión**

```ts
// src/core/domain/ports/embedding-queue-port/embedding-queue.port.ts
export abstract class EmbeddingQueuePort {
    abstract enqueue(itemIds: string[]): Promise<void>;
}
```

```ts
// src/core/use-case/process-item-embedding/process-item-embedding.use-case.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ItemRepositoryPort } from '../../domain/ports/item-port/item.port.js';
import { EmbeddingPort } from '../../domain/ports/embedding-port/embedding.port.js';

@Injectable()
export class ProcessItemEmbeddingUseCase {
    private readonly logger = new Logger(ProcessItemEmbeddingUseCase.name);

    constructor(
        @Inject(ItemRepositoryPort) private readonly items: ItemRepositoryPort,
        @Inject(EmbeddingPort) private readonly embedding: EmbeddingPort,
    ) {}

    async execute(itemId: string): Promise<void> {
        const item = await this.items.findToEmbed(itemId);

        if (!item) {
            this.logger.warn(`El ítem ${itemId} ya no está pendiente; se omite`);
            return;
        }

        const [vector] = await this.embedding.embed([item.text]);

        if (!vector || vector.length !== item.dimension) {
            throw new Error(`Embedding dimension mismatch: expected ${item.dimension}, got ${vector?.length ?? 0}`);
        }

        await this.items.markReady(itemId, vector);
    }

    async fail(itemId: string, reason: string): Promise<void> {
        await this.items.markFailed(itemId, reason);
    }
}
```

```ts
// src/infrastructure/queue/redis-connection.ts
export interface RedisConnectionOptions {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
}

export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
    const url = new URL(redisUrl);
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 6379,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        maxRetriesPerRequest: null,
    };
}
```

- [ ] **Step 4: Correr los tests unitarios y verificar que pasan**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Escribir el test de integración de la cola con Redis real (falla)**

```ts
// src/infrastructure/queue/bull-embedding-queue.int-spec.ts
import { randomUUID } from 'node:crypto';
import { BullEmbeddingQueue } from './bull-embedding-queue.js';
import { TEST_ENV } from '../../../test/env.js';

function buildQueue(processor: { execute: (id: string) => Promise<void>; fail: (id: string, reason: string) => Promise<void> }) {
  const values: Record<string, string> = {
    REDIS_URL: TEST_ENV.REDIS_URL,
    EMBEDDING_QUEUE_NAME: `test-${randomUUID()}`,
    EMBEDDING_JOB_ATTEMPTS: '2',
    EMBEDDING_JOB_BACKOFF_MS: '50',
  };
  const config = { get: (key: string) => values[key] };
  return new BullEmbeddingQueue(config as any, processor as any);
}

describe('BullEmbeddingQueue (integración con Redis)', () => {
  let queue: BullEmbeddingQueue | undefined;

  afterEach(async () => {
    await queue?.onModuleDestroy();
    queue = undefined;
  });

  it('procesa cada id encolado con el caso de uso', async () => {
    const processed: string[] = [];
    const processor = {
      execute: vi.fn(async (id: string) => {
        processed.push(id);
      }),
      fail: vi.fn(),
    };
    queue = buildQueue(processor);
    await queue.onModuleInit();

    await queue.enqueue(['a', 'b']);

    await vi.waitFor(() => expect([...processed].sort()).toEqual(['a', 'b']), { timeout: 10000 });
    expect(processor.fail).not.toHaveBeenCalled();
  });

  it('reintenta y, al agotar los intentos, marca el ítem como fallido una sola vez', async () => {
    const processor = {
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
      fail: vi.fn(async () => undefined),
    };
    queue = buildQueue(processor);
    await queue.onModuleInit();

    await queue.enqueue(['x']);

    await vi.waitFor(() => expect(processor.fail).toHaveBeenCalledWith('x', 'boom'), { timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(processor.execute).toHaveBeenCalledTimes(2);
    expect(processor.fail).toHaveBeenCalledTimes(1);
  });

  it('no falla al encolar una lista vacía', async () => {
    queue = buildQueue({ execute: vi.fn(), fail: vi.fn() });
    await queue.onModuleInit();

    await expect(queue.enqueue([])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — no existe `bull-embedding-queue.js`.

- [ ] **Step 7: Implementar el adapter BullMQ y su módulo**

```ts
// src/infrastructure/queue/bull-embedding-queue.ts
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { EmbeddingQueuePort } from '../../core/domain/ports/embedding-queue-port/embedding-queue.port.js';
import { ProcessItemEmbeddingUseCase } from '../../core/use-case/process-item-embedding/process-item-embedding.use-case.js';
import { parseRedisUrl } from './redis-connection.js';

const DEFAULT_QUEUE_NAME = 'item-embedding';
const WORKER_CONCURRENCY = 4;

interface EmbeddingJob {
    itemId: string;
}

@Injectable()
export class BullEmbeddingQueue implements EmbeddingQueuePort, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(BullEmbeddingQueue.name);
    private queue?: Queue<EmbeddingJob>;
    private worker?: Worker<EmbeddingJob>;

    constructor(
        private readonly config: ConfigService,
        @Inject(ProcessItemEmbeddingUseCase) private readonly processor: ProcessItemEmbeddingUseCase,
    ) {}

    onModuleInit() {
        const name = this.config.get<string>('EMBEDDING_QUEUE_NAME') ?? DEFAULT_QUEUE_NAME;
        const connection = parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');

        this.queue = new Queue<EmbeddingJob>(name, { connection });
        this.worker = new Worker<EmbeddingJob>(name, (job) => this.processor.execute(job.data.itemId), {
            connection,
            concurrency: WORKER_CONCURRENCY,
        });

        this.worker.on('failed', (job, error) => {
            if (!job) return;
            const maxAttempts = job.opts.attempts ?? 1;
            if (job.attemptsMade >= maxAttempts) {
                this.processor
                    .fail(job.data.itemId, error.message)
                    .catch((failError) => this.logger.error(`No se pudo marcar el ítem ${job.data.itemId} como fallido: ${failError}`));
            }
        });
        this.worker.on('error', (error) => this.logger.error(`Error en el worker de embeddings: ${error}`));
    }

    async enqueue(itemIds: string[]): Promise<void> {
        if (itemIds.length === 0 || !this.queue) return;

        const attempts = Number(this.config.get<string>('EMBEDDING_JOB_ATTEMPTS') ?? '5');
        const delay = Number(this.config.get<string>('EMBEDDING_JOB_BACKOFF_MS') ?? '2000');

        await this.queue.addBulk(
            itemIds.map((itemId) => ({
                name: 'embed',
                data: { itemId },
                opts: {
                    attempts,
                    backoff: { type: 'exponential', delay },
                    removeOnComplete: true,
                    removeOnFail: 1000,
                },
            })),
        );
    }

    async onModuleDestroy() {
        await this.worker?.close();
        await this.queue?.close();
    }
}
```

```ts
// src/infrastructure/queue/embedding-queue.module.ts
import { Module } from '@nestjs/common';
import { BullEmbeddingQueue } from './bull-embedding-queue.js';
import { ProcessItemEmbeddingUseCase } from '../../core/use-case/process-item-embedding/process-item-embedding.use-case.js';
import { EmbeddingQueuePort } from '../../core/domain/ports/embedding-queue-port/embedding-queue.port.js';
import { ItemRepositoryModule } from '../persistence/prisma/item-repository.module.js';
import { EmbeddingModule } from '../extern/embedding/embedding.module.js';

@Module({
    imports: [ItemRepositoryModule, EmbeddingModule],
    providers: [
        ProcessItemEmbeddingUseCase,
        BullEmbeddingQueue,
        { provide: EmbeddingQueuePort, useExisting: BullEmbeddingQueue },
    ],
    exports: [EmbeddingQueuePort],
})
export class EmbeddingQueueModule {}
```

- [ ] **Step 8: Correr el test de integración y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS. Si el segundo test de la cola llama a `fail` más de una vez o ninguna, el problema está en la condición `job.attemptsMade >= maxAttempts` del handler `failed`: ajustarla según lo que informe BullMQ (`job.attemptsMade` y `job.opts.attempts`) hasta que el test pase, sin modificar el test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add BullMQ embedding queue with retries and failed-state handling"
```

---

## Task 9: API de ítems (agregar y consultar)

**Files:**
- Create: `src/core/use-case/add-items/add-items.use-case.ts`, `add-items.use-case.spec.ts`
- Create: `src/core/use-case/get-item/get-item.use-case.ts`, `get-item.use-case.spec.ts`
- Create: `src/controller/dto/add-items.dto.ts`, `src/controller/items.controller.ts`, `items.controller.spec.ts`
- Modify: `src/controller/rag-api.module.ts`

**Interfaces:**
- Consumes: `CollectionRepositoryPort.findByName` (Task 6), `ItemRepositoryPort` (Task 7), `EmbeddingQueuePort` (Task 8), `CollectionNotFoundError`/`ItemNotFoundError` (Task 6).
- Produces:
  - `AddItemsUseCase.execute(tenantId, collectionName, items: NewItem[]): Promise<Item[]>` — guarda los ítems como `pending` y los encola; si encolar falla, los marca `failed` y relanza el error.
  - `GetItemUseCase.execute(tenantId, collectionName, itemId): Promise<Item>`.
  - Endpoints: `POST /collections/:collection/items` (`202`, body `{ items: [{ text, metadata? }] }`, respuesta `{ items: [{ id, status }] }`) y `GET /collections/:collection/items/:itemId`.

- [ ] **Step 1: Escribir los tests de los casos de uso (fallan)**

```ts
// src/core/use-case/add-items/add-items.use-case.spec.ts
import { AddItemsUseCase } from './add-items.use-case.js';
import { CollectionNotFoundError } from '../../domain/errors.js';

describe('AddItemsUseCase', () => {
  const collectionsMock = { create: vi.fn(), list: vi.fn(), findByName: vi.fn() };
  const itemsMock = { createPending: vi.fn(), findById: vi.fn(), findToEmbed: vi.fn(), markReady: vi.fn(), markFailed: vi.fn() };
  const queueMock = { enqueue: vi.fn() };
  const useCase = new AddItemsUseCase(collectionsMock, itemsMock, queueMock);
  const collection = { id: 'c1', tenantId: 't1', name: 'conversations', embeddingModel: 'm', dimension: 3, createdAt: new Date() };
  const newItems = [{ text: 'hola', metadata: { personId: 'p1' } }];
  const created = [{ id: 'i1', collectionId: 'c1', text: 'hola', metadata: { personId: 'p1' }, status: 'pending', createdAt: new Date() }];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('busca la colección dentro del tenant, guarda los ítems como pendientes y los encola', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    itemsMock.createPending.mockResolvedValueOnce(created);

    const result = await useCase.execute('t1', 'conversations', newItems);

    expect(collectionsMock.findByName).toHaveBeenCalledWith('t1', 'conversations');
    expect(itemsMock.createPending).toHaveBeenCalledWith('c1', newItems);
    expect(queueMock.enqueue).toHaveBeenCalledWith(['i1']);
    expect(result).toBe(created);
  });

  it('lanza CollectionNotFoundError si la colección no existe para ese tenant', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(null);

    await expect(useCase.execute('t1', 'nada', newItems)).rejects.toThrow(CollectionNotFoundError);
    expect(itemsMock.createPending).not.toHaveBeenCalled();
  });

  it('si no se puede encolar, marca los ítems como fallidos y relanza el error', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    itemsMock.createPending.mockResolvedValueOnce(created);
    queueMock.enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(useCase.execute('t1', 'conversations', newItems)).rejects.toThrow('redis down');
    expect(itemsMock.markFailed).toHaveBeenCalledWith('i1', 'Could not enqueue embedding job');
  });
});
```

```ts
// src/core/use-case/get-item/get-item.use-case.spec.ts
import { GetItemUseCase } from './get-item.use-case.js';
import { CollectionNotFoundError, ItemNotFoundError } from '../../domain/errors.js';

describe('GetItemUseCase', () => {
  const collectionsMock = { create: vi.fn(), list: vi.fn(), findByName: vi.fn() };
  const itemsMock = { createPending: vi.fn(), findById: vi.fn(), findToEmbed: vi.fn(), markReady: vi.fn(), markFailed: vi.fn() };
  const useCase = new GetItemUseCase(collectionsMock, itemsMock);
  const collection = { id: 'c1', tenantId: 't1', name: 'conversations', embeddingModel: 'm', dimension: 3, createdAt: new Date() };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('devuelve el ítem de la colección del tenant', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    itemsMock.findById.mockResolvedValueOnce({ id: 'i1' });

    expect(await useCase.execute('t1', 'conversations', 'i1')).toEqual({ id: 'i1' });
    expect(itemsMock.findById).toHaveBeenCalledWith('c1', 'i1');
  });

  it('lanza CollectionNotFoundError si la colección no existe', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(null);

    await expect(useCase.execute('t1', 'nada', 'i1')).rejects.toThrow(CollectionNotFoundError);
  });

  it('lanza ItemNotFoundError si el ítem no existe en esa colección', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    itemsMock.findById.mockResolvedValueOnce(null);

    await expect(useCase.execute('t1', 'conversations', 'i1')).rejects.toThrow(ItemNotFoundError);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — no existen los casos de uso.

- [ ] **Step 3: Implementar los casos de uso**

```ts
// src/core/use-case/add-items/add-items.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { Item } from '../../domain/entities/item.entity.js';
import { CollectionNotFoundError } from '../../domain/errors.js';
import { CollectionRepositoryPort } from '../../domain/ports/collection-port/collection.port.js';
import { ItemRepositoryPort, NewItem } from '../../domain/ports/item-port/item.port.js';
import { EmbeddingQueuePort } from '../../domain/ports/embedding-queue-port/embedding-queue.port.js';

@Injectable()
export class AddItemsUseCase {
    constructor(
        @Inject(CollectionRepositoryPort) private readonly collections: CollectionRepositoryPort,
        @Inject(ItemRepositoryPort) private readonly items: ItemRepositoryPort,
        @Inject(EmbeddingQueuePort) private readonly queue: EmbeddingQueuePort,
    ) {}

    async execute(tenantId: string, collectionName: string, newItems: NewItem[]): Promise<Item[]> {
        const collection = await this.collections.findByName(tenantId, collectionName);

        if (!collection) {
            throw new CollectionNotFoundError(collectionName);
        }

        const created = await this.items.createPending(collection.id, newItems);

        try {
            await this.queue.enqueue(created.map((item) => item.id));
        } catch (error) {
            await Promise.all(created.map((item) => this.items.markFailed(item.id, 'Could not enqueue embedding job')));
            throw error;
        }

        return created;
    }
}
```

```ts
// src/core/use-case/get-item/get-item.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { Item } from '../../domain/entities/item.entity.js';
import { CollectionNotFoundError, ItemNotFoundError } from '../../domain/errors.js';
import { CollectionRepositoryPort } from '../../domain/ports/collection-port/collection.port.js';
import { ItemRepositoryPort } from '../../domain/ports/item-port/item.port.js';

@Injectable()
export class GetItemUseCase {
    constructor(
        @Inject(CollectionRepositoryPort) private readonly collections: CollectionRepositoryPort,
        @Inject(ItemRepositoryPort) private readonly items: ItemRepositoryPort,
    ) {}

    async execute(tenantId: string, collectionName: string, itemId: string): Promise<Item> {
        const collection = await this.collections.findByName(tenantId, collectionName);

        if (!collection) {
            throw new CollectionNotFoundError(collectionName);
        }

        const item = await this.items.findById(collection.id, itemId);

        if (!item) {
            throw new ItemNotFoundError(itemId);
        }

        return item;
    }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Escribir el test del controller (falla)**

```ts
// src/controller/items.controller.spec.ts
import { ItemsController } from './items.controller.js';

describe('ItemsController', () => {
  const addMock = { execute: vi.fn() };
  const getMock = { execute: vi.fn() };
  const controller = new ItemsController(addMock as any, getMock as any);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('addItems pasa tenantId y colección al caso de uso, usa {} si falta metadata y responde solo id y status', async () => {
    addMock.execute.mockResolvedValueOnce([{ id: 'i1', status: 'pending', text: 'hola', metadata: {} }]);

    const result = await controller.addItems('t1', 'conversations', {
      items: [{ text: 'hola' }, { text: 'chau', metadata: { personId: 'p1' } }],
    });

    expect(addMock.execute).toHaveBeenCalledWith('t1', 'conversations', [
      { text: 'hola', metadata: {} },
      { text: 'chau', metadata: { personId: 'p1' } },
    ]);
    expect(result).toEqual({ items: [{ id: 'i1', status: 'pending' }] });
  });

  it('getItem devuelve el ítem sin exponer el id de la colección', async () => {
    const createdAt = new Date('2026-10-07T00:00:00Z');
    getMock.execute.mockResolvedValueOnce({ id: 'i1', collectionId: 'c1', text: 'hola', metadata: {}, status: 'ready', createdAt });

    const result = await controller.getItem('t1', 'conversations', 'i1');

    expect(getMock.execute).toHaveBeenCalledWith('t1', 'conversations', 'i1');
    expect(result).toEqual({ id: 'i1', text: 'hola', metadata: {}, status: 'ready', createdAt });
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm test`
Expected: FAIL — no existe `items.controller.js`.

- [ ] **Step 7: Implementar DTO, controller y ampliar el módulo**

```ts
// src/controller/dto/add-items.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ItemInputDto {
    @ApiProperty({ example: 'Quiero pedir una pizza grande', maxLength: 8000 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(8000)
    text: string;

    @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { personId: 'p1', role: 'inbound' } })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;
}

export class AddItemsDto {
    @ApiProperty({ type: [ItemInputDto], description: 'Entre 1 y 100 ítems por request' })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => ItemInputDto)
    items: ItemInputDto[];
}
```

```ts
// src/controller/items.controller.ts
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { TenantId } from './decorators/tenant-id.decorator.js';
import { AddItemsDto } from './dto/add-items.dto.js';
import { AddItemsUseCase } from '../core/use-case/add-items/add-items.use-case.js';
import { GetItemUseCase } from '../core/use-case/get-item/get-item.use-case.js';

@ApiTags('items')
@ApiSecurity('api-key')
@Controller('collections/:collection/items')
@UseGuards(ApiKeyGuard)
export class ItemsController {
    constructor(
        private readonly addItemsUseCase: AddItemsUseCase,
        private readonly getItemUseCase: GetItemUseCase,
    ) {}

    @Post()
    @HttpCode(202)
    async addItems(@TenantId() tenantId: string, @Param('collection') collection: string, @Body() dto: AddItemsDto) {
        const created = await this.addItemsUseCase.execute(
            tenantId,
            collection,
            dto.items.map((item) => ({ text: item.text, metadata: item.metadata ?? {} })),
        );
        return { items: created.map((item) => ({ id: item.id, status: item.status })) };
    }

    @Get(':itemId')
    async getItem(@TenantId() tenantId: string, @Param('collection') collection: string, @Param('itemId') itemId: string) {
        const item = await this.getItemUseCase.execute(tenantId, collection, itemId);
        return { id: item.id, text: item.text, metadata: item.metadata, status: item.status, createdAt: item.createdAt };
    }
}
```

```ts
// src/controller/rag-api.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CollectionsController } from './collections.controller.js';
import { ItemsController } from './items.controller.js';
import { DomainErrorFilter } from './filters/domain-error.filter.js';
import { CreateCollectionUseCase } from '../core/use-case/create-collection/create-collection.use-case.js';
import { ListCollectionsUseCase } from '../core/use-case/list-collections/list-collections.use-case.js';
import { AddItemsUseCase } from '../core/use-case/add-items/add-items.use-case.js';
import { GetItemUseCase } from '../core/use-case/get-item/get-item.use-case.js';
import { TenantAccessModule } from '../infrastructure/persistence/prisma/tenant-access.module.js';
import { CollectionRepositoryModule } from '../infrastructure/persistence/prisma/collection-repository.module.js';
import { ItemRepositoryModule } from '../infrastructure/persistence/prisma/item-repository.module.js';
import { EmbeddingModule } from '../infrastructure/extern/embedding/embedding.module.js';
import { EmbeddingQueueModule } from '../infrastructure/queue/embedding-queue.module.js';

@Module({
    imports: [TenantAccessModule, CollectionRepositoryModule, ItemRepositoryModule, EmbeddingModule, EmbeddingQueueModule],
    controllers: [CollectionsController, ItemsController],
    providers: [
        CreateCollectionUseCase,
        ListCollectionsUseCase,
        AddItemsUseCase,
        GetItemUseCase,
        { provide: APP_FILTER, useClass: DomainErrorFilter },
    ],
})
export class RagApiModule {}
```

- [ ] **Step 8: Correr todos los tests y compilar**

Run: `pnpm test && pnpm build`
Expected: PASS y build sin errores.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add items API (add, get status) with async embedding enqueue"
```

---

## Task 10: Búsqueda por similitud

**Files:**
- Modify: `src/core/domain/errors.ts`, `src/controller/filters/domain-error.filter.ts`, `src/controller/filters/domain-error.filter.spec.ts`
- Create: `src/core/domain/ports/item-port/item-search.port.ts`
- Modify: `src/infrastructure/persistence/prisma/item.prisma.repository.ts`, `item.prisma.repository.int-spec.ts`, `item-repository.module.ts`
- Create: `src/core/use-case/search-items/search-items.use-case.ts`, `search-items.use-case.spec.ts`
- Create: `src/controller/dto/search.dto.ts`, `src/controller/search.controller.ts`, `search.controller.spec.ts`
- Modify: `src/controller/rag-api.module.ts`

**Interfaces:**
- Consumes: `CollectionRepositoryPort.findByName`, `EmbeddingPort.embed/dimension`, `SearchHit` (Task 7), `toVectorLiteral` (Task 7).
- Produces:
  - `CollectionEmbeddingMismatchError(collectionName, expected, actual)` → HTTP 409.
  - `abstract class ItemSearchPort { search(collectionId: string, embedding: number[], topK: number, filter: Record<string, unknown>): Promise<SearchHit[]>; }` (implementado por `ItemPrismaRepository`, exportado por `ItemRepositoryModule`).
  - `SearchItemsUseCase.execute(tenantId, collectionName, request: { query: string; topK?: number; filter?: Record<string, unknown> }): Promise<SearchHit[]>` (`topK` por defecto 5).
  - Endpoint `POST /collections/:collection/search` → `200 { results: [{ id, text, metadata, score }] }`, `score` = similitud coseno (1 = idéntico).

- [ ] **Step 1: Agregar el error de dimensión y su mapeo HTTP (tests primero)**

Agregar al final de `src/controller/filters/domain-error.filter.spec.ts`, dentro del `describe`, este test (y sumar `CollectionEmbeddingMismatchError` al import de `errors.js`):

```ts
  it('responde 409 cuando la colección fue creada con otra dimensión de embeddings', () => {
    expect(run(new CollectionEmbeddingMismatchError('conversations', 1024, 512)).status).toHaveBeenCalledWith(409);
  });
```

Run: `pnpm test`
Expected: FAIL — `CollectionEmbeddingMismatchError` no existe.

Agregar a `src/core/domain/errors.ts`:

```ts
export class CollectionEmbeddingMismatchError extends DomainError {
    constructor(collectionName: string, expected: number, actual: number) {
        super(`La colección "${collectionName}" usa embeddings de dimensión ${expected}, pero el servicio genera dimensión ${actual}`);
    }
}
```

Y en `src/controller/filters/domain-error.filter.ts`, sumar el import y cambiar la línea del 409:

```ts
        if (error instanceof CollectionAlreadyExistsError || error instanceof CollectionEmbeddingMismatchError) return 409;
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Crear el puerto de búsqueda**

```ts
// src/core/domain/ports/item-port/item-search.port.ts
import { SearchHit } from '../../entities/item.entity.js';

export abstract class ItemSearchPort {
    abstract search(
        collectionId: string,
        embedding: number[],
        topK: number,
        filter: Record<string, unknown>,
    ): Promise<SearchHit[]>;
}
```

- [ ] **Step 3: Escribir los tests de integración de la búsqueda (fallan)**

Agregar estos tests dentro del `describe` de `item.prisma.repository.int-spec.ts`:

```ts
  describe('search', () => {
    async function createReadyItem(targetCollectionId: string, text: string, metadata: Record<string, unknown>, embedding: number[]) {
      const [item] = await repository.createPending(targetCollectionId, [{ text, metadata }]);
      await repository.markReady(item.id, embedding);
      return item;
    }

    it('ordena por similitud coseno y devuelve el score (1 = idéntico)', async () => {
      await createReadyItem(collectionId, 'eje x', {}, [1, 0, 0]);
      await createReadyItem(collectionId, 'casi x', {}, [0.9, 0.1, 0]);
      await createReadyItem(collectionId, 'eje y', {}, [0, 1, 0]);

      const hits = await repository.search(collectionId, [1, 0, 0], 3, {});

      expect(hits.map((hit) => hit.text)).toEqual(['eje x', 'casi x', 'eje y']);
      expect(hits[0].score).toBeCloseTo(1, 5);
      expect(hits[2].score).toBeCloseTo(0, 5);
    });

    it('respeta topK', async () => {
      await createReadyItem(collectionId, 'a', {}, [1, 0, 0]);
      await createReadyItem(collectionId, 'b', {}, [0, 1, 0]);

      expect(await repository.search(collectionId, [1, 0, 0], 1, {})).toHaveLength(1);
    });

    it('ignora los ítems pending y failed', async () => {
      await createReadyItem(collectionId, 'listo', {}, [1, 0, 0]);
      await repository.createPending(collectionId, [{ text: 'pendiente', metadata: {} }]);
      const [failed] = await repository.createPending(collectionId, [{ text: 'fallido', metadata: {} }]);
      await repository.markFailed(failed.id, 'x');

      const hits = await repository.search(collectionId, [1, 0, 0], 10, {});

      expect(hits.map((hit) => hit.text)).toEqual(['listo']);
    });

    it('filtra por igualdad exacta sobre la metadata', async () => {
      await createReadyItem(collectionId, 'de p1', { personId: 'p1' }, [1, 0, 0]);
      await createReadyItem(collectionId, 'de p2', { personId: 'p2' }, [1, 0, 0]);

      const hits = await repository.search(collectionId, [1, 0, 0], 10, { personId: 'p1' });

      expect(hits.map((hit) => hit.text)).toEqual(['de p1']);
      expect(hits[0].metadata).toEqual({ personId: 'p1' });
    });

    it('nunca devuelve ítems de otra colección', async () => {
      await createReadyItem(otherCollectionId, 'ajeno', {}, [1, 0, 0]);

      expect(await repository.search(collectionId, [1, 0, 0], 10, {})).toEqual([]);
    });
  });
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `pnpm test:int`
Expected: FAIL — `repository.search is not a function`.

- [ ] **Step 5: Implementar `search` en el adapter y exportar el puerto**

En `src/infrastructure/persistence/prisma/item.prisma.repository.ts`: cambiar la declaración a `implements ItemRepositoryPort, ItemSearchPort`, sumar los imports `SearchHit` (desde `item.entity.js`) e `ItemSearchPort` (desde `../../../core/domain/ports/item-port/item-search.port.js`), y agregar este método dentro de la clase:

```ts
    async search(
        collectionId: string,
        embedding: number[],
        topK: number,
        filter: Record<string, unknown>,
    ): Promise<SearchHit[]> {
        const vector = toVectorLiteral(embedding);
        const filterJson = JSON.stringify(filter);

        const rows = await this.prisma.$queryRaw<
            { id: string; text: string; metadata: Record<string, unknown>; score: number }[]
        >`
            SELECT "id", "text", "metadata", 1 - ("embedding" <=> ${vector}::vector) AS "score"
            FROM "Item"
            WHERE "collectionId" = ${collectionId}
              AND "status" = 'ready'
              AND "metadata" @> ${filterJson}::jsonb
            ORDER BY "embedding" <=> ${vector}::vector
            LIMIT ${topK}
        `;

        return rows.map((row) => ({ id: row.id, text: row.text, metadata: row.metadata, score: Number(row.score) }));
    }
```

```ts
// src/infrastructure/persistence/prisma/item-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { ItemPrismaRepository } from './item.prisma.repository.js';
import { ItemRepositoryPort } from '../../../core/domain/ports/item-port/item.port.js';
import { ItemSearchPort } from '../../../core/domain/ports/item-port/item-search.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        ItemPrismaRepository,
        { provide: ItemRepositoryPort, useExisting: ItemPrismaRepository },
        { provide: ItemSearchPort, useExisting: ItemPrismaRepository },
    ],
    exports: [ItemRepositoryPort, ItemSearchPort],
})
export class ItemRepositoryModule {}
```

- [ ] **Step 6: Correr el test de integración y verificar que pasa**

Run: `pnpm test:int`
Expected: PASS (los 5 tests nuevos de `search` y los anteriores).

- [ ] **Step 7: Escribir los tests del caso de uso y del controller (fallan)**

```ts
// src/core/use-case/search-items/search-items.use-case.spec.ts
import { SearchItemsUseCase } from './search-items.use-case.js';
import { CollectionEmbeddingMismatchError, CollectionNotFoundError } from '../../domain/errors.js';

describe('SearchItemsUseCase', () => {
  const collectionsMock = { create: vi.fn(), list: vi.fn(), findByName: vi.fn() };
  const searchMock = { search: vi.fn() };
  const embeddingMock = { model: 'm', dimension: 3, embed: vi.fn() };
  const useCase = new SearchItemsUseCase(collectionsMock, searchMock, embeddingMock);
  const collection = { id: 'c1', tenantId: 't1', name: 'conversations', embeddingModel: 'm', dimension: 3, createdAt: new Date() };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('embebe la consulta y busca en la colección del tenant con topK=5 por defecto', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    embeddingMock.embed.mockResolvedValueOnce([[1, 0, 0]]);
    searchMock.search.mockResolvedValueOnce([{ id: 'i1', text: 'hola', metadata: {}, score: 0.9 }]);

    const result = await useCase.execute('t1', 'conversations', { query: 'hola' });

    expect(collectionsMock.findByName).toHaveBeenCalledWith('t1', 'conversations');
    expect(embeddingMock.embed).toHaveBeenCalledWith(['hola']);
    expect(searchMock.search).toHaveBeenCalledWith('c1', [1, 0, 0], 5, {});
    expect(result).toHaveLength(1);
  });

  it('respeta topK y filter recibidos', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    embeddingMock.embed.mockResolvedValueOnce([[1, 0, 0]]);
    searchMock.search.mockResolvedValueOnce([]);

    await useCase.execute('t1', 'conversations', { query: 'hola', topK: 3, filter: { personId: 'p1' } });

    expect(searchMock.search).toHaveBeenCalledWith('c1', [1, 0, 0], 3, { personId: 'p1' });
  });

  it('lanza CollectionNotFoundError si la colección no existe para ese tenant', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(null);

    await expect(useCase.execute('t1', 'nada', { query: 'hola' })).rejects.toThrow(CollectionNotFoundError);
    expect(embeddingMock.embed).not.toHaveBeenCalled();
  });

  it('lanza CollectionEmbeddingMismatchError si la dimensión de la consulta no coincide con la de la colección', async () => {
    collectionsMock.findByName.mockResolvedValueOnce(collection);
    embeddingMock.embed.mockResolvedValueOnce([[1, 0]]);

    await expect(useCase.execute('t1', 'conversations', { query: 'hola' })).rejects.toThrow(CollectionEmbeddingMismatchError);
    expect(searchMock.search).not.toHaveBeenCalled();
  });
});
```

```ts
// src/controller/search.controller.spec.ts
import { SearchController } from './search.controller.js';

describe('SearchController', () => {
  const searchMock = { execute: vi.fn() };
  const controller = new SearchController(searchMock as any);

  it('search pasa tenantId, colección y parámetros al caso de uso y envuelve los resultados', async () => {
    const hits = [{ id: 'i1', text: 'hola', metadata: { personId: 'p1' }, score: 0.9 }];
    searchMock.execute.mockResolvedValueOnce(hits);

    const result = await controller.search('t1', 'conversations', { query: 'hola', topK: 3, filter: { personId: 'p1' } });

    expect(searchMock.execute).toHaveBeenCalledWith('t1', 'conversations', { query: 'hola', topK: 3, filter: { personId: 'p1' } });
    expect(result).toEqual({ results: hits });
  });
});
```

- [ ] **Step 8: Correr los tests y verificar que fallan**

Run: `pnpm test`
Expected: FAIL — no existen el caso de uso ni el controller.

- [ ] **Step 9: Implementar caso de uso, DTO, controller y ampliar el módulo**

```ts
// src/core/use-case/search-items/search-items.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { SearchHit } from '../../domain/entities/item.entity.js';
import { CollectionEmbeddingMismatchError, CollectionNotFoundError } from '../../domain/errors.js';
import { CollectionRepositoryPort } from '../../domain/ports/collection-port/collection.port.js';
import { ItemSearchPort } from '../../domain/ports/item-port/item-search.port.js';
import { EmbeddingPort } from '../../domain/ports/embedding-port/embedding.port.js';

const DEFAULT_TOP_K = 5;

export interface SearchRequest {
    query: string;
    topK?: number;
    filter?: Record<string, unknown>;
}

@Injectable()
export class SearchItemsUseCase {
    constructor(
        @Inject(CollectionRepositoryPort) private readonly collections: CollectionRepositoryPort,
        @Inject(ItemSearchPort) private readonly itemSearch: ItemSearchPort,
        @Inject(EmbeddingPort) private readonly embedding: EmbeddingPort,
    ) {}

    async execute(tenantId: string, collectionName: string, request: SearchRequest): Promise<SearchHit[]> {
        const collection = await this.collections.findByName(tenantId, collectionName);

        if (!collection) {
            throw new CollectionNotFoundError(collectionName);
        }

        const [vector] = await this.embedding.embed([request.query]);

        if (!vector || vector.length !== collection.dimension) {
            throw new CollectionEmbeddingMismatchError(collectionName, collection.dimension, vector?.length ?? 0);
        }

        return this.itemSearch.search(collection.id, vector, request.topK ?? DEFAULT_TOP_K, request.filter ?? {});
    }
}
```

```ts
// src/controller/dto/search.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchDto {
    @ApiProperty({ example: '¿cuánto cuesta la pizza grande?' })
    @IsString()
    @IsNotEmpty()
    query: string;

    @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 5 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    topK?: number;

    @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { personId: 'p1' }, description: 'Igualdad exacta sobre la metadata' })
    @IsOptional()
    @IsObject()
    filter?: Record<string, unknown>;
}
```

```ts
// src/controller/search.controller.ts
import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { TenantId } from './decorators/tenant-id.decorator.js';
import { SearchDto } from './dto/search.dto.js';
import { SearchItemsUseCase } from '../core/use-case/search-items/search-items.use-case.js';

@ApiTags('search')
@ApiSecurity('api-key')
@Controller('collections/:collection/search')
@UseGuards(ApiKeyGuard)
export class SearchController {
    constructor(private readonly searchItemsUseCase: SearchItemsUseCase) {}

    @Post()
    @HttpCode(200)
    async search(@TenantId() tenantId: string, @Param('collection') collection: string, @Body() dto: SearchDto) {
        const results = await this.searchItemsUseCase.execute(tenantId, collection, {
            query: dto.query,
            topK: dto.topK,
            filter: dto.filter,
        });
        return { results };
    }
}
```

En `src/controller/rag-api.module.ts` agregar los imports de `SearchController` (`./search.controller.js`) y `SearchItemsUseCase` (`../core/use-case/search-items/search-items.use-case.js`), y dejar los arrays así:

```ts
    controllers: [CollectionsController, ItemsController, SearchController],
    providers: [
        CreateCollectionUseCase,
        ListCollectionsUseCase,
        AddItemsUseCase,
        GetItemUseCase,
        SearchItemsUseCase,
        { provide: APP_FILTER, useClass: DomainErrorFilter },
    ],
```

- [ ] **Step 10: Correr todos los tests y compilar**

Run: `pnpm test && pnpm test:int && pnpm build`
Expected: todo PASS y build sin errores.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add similarity search (cosine, metadata filter, ready-only) and search endpoint"
```

---

## Task 11: Arranque de la app, OpenAPI, Docker, test end-to-end y documentación

**Files:**
- Create: `src/app.setup.ts`
- Modify: `src/main.ts`
- Create: `test/helpers/fake-embedding.ts`, `test/rag-api.e2e-spec.ts`
- Create: `Dockerfile`, `README.md`, `CLAUDE_CONTEXT.md`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `configureApp(app: INestApplication): void` (ValidationPipe global; lo usan `main.ts` y el e2e), servicio ejecutable con `pnpm start:dev` y con Docker, documentación OpenAPI en `/docs`.

- [ ] **Step 1: Crear el helper de arranque y reescribir `main.ts`**

```ts
// src/app.setup.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
```

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('RAG Service')
    .setDescription('Colecciones, ítems con metadata, embeddings y búsqueda por similitud, aislados por tenant.')
    .setVersion('1')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3100);
  new Logger('Bootstrap').log(`RAG Service running on: ${await app.getUrl()}`);
}
await bootstrap();
```

- [ ] **Step 2: Crear el embedding falso para tests**

```ts
// test/helpers/fake-embedding.ts
import { EmbeddingPort } from '../../src/core/domain/ports/embedding-port/embedding.port.js';

const DIMENSION = 64;

// Bolsa de palabras hasheada: dos textos que comparten palabras tienen vectores parecidos.
export class FakeEmbedding extends EmbeddingPort {
    readonly model = 'fake-embedding';
    readonly dimension = DIMENSION;

    async embed(texts: string[]): Promise<number[][]> {
        return texts.map((text) => {
            const vector = new Array<number>(DIMENSION).fill(0);
            for (const word of text.toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter(Boolean)) {
                let hash = 7;
                for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
                vector[hash % DIMENSION] += 1;
            }
            return vector;
        });
    }
}
```

- [ ] **Step 3: Escribir el test end-to-end (falla)**

```ts
// test/rag-api.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { EmbeddingPort } from '../src/core/domain/ports/embedding-port/embedding.port.js';
import { TenantAccessPort } from '../src/core/domain/ports/tenant-access-port/tenant-access.port.js';
import { CreateTenantUseCase } from '../src/core/use-case/create-tenant/create-tenant.use-case.js';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service.js';
import { FakeEmbedding } from './helpers/fake-embedding.js';
import { truncateAll } from './helpers/db.js';

describe('RAG API (e2e)', () => {
  let app: INestApplication;
  let keyA: string;
  let keyB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmbeddingPort)
      .useValue(new FakeEmbedding())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await truncateAll(app.get(PrismaService, { strict: false }));
    const createTenant = new CreateTenantUseCase(app.get(TenantAccessPort, { strict: false }));
    keyA = (await createTenant.execute('Tenant A')).apiKey;
    keyB = (await createTenant.execute('Tenant B')).apiKey;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('rechaza las requests sin API key o con una key inválida', async () => {
    await http().get('/collections').expect(401);
    await http().get('/collections').set('X-API-Key', 'rag_invalida').expect(401);
  });

  it('crea una colección, rechaza duplicados y nombres inválidos', async () => {
    const created = await http().post('/collections').set('X-API-Key', keyA).send({ name: 'conversations' }).expect(201);
    expect(created.body).toMatchObject({ name: 'conversations', embeddingModel: 'fake-embedding', dimension: 64 });

    await http().post('/collections').set('X-API-Key', keyA).send({ name: 'conversations' }).expect(409);
    await http().post('/collections').set('X-API-Key', keyA).send({ name: 'Nombre Inválido' }).expect(400);

    const listed = await http().get('/collections').set('X-API-Key', keyA).expect(200);
    expect(listed.body.map((c: { name: string }) => c.name)).toEqual(['conversations']);
  });

  it('guarda ítems, los procesa en segundo plano y los encuentra por similitud con filtro de metadata', async () => {
    const added = await http()
      .post('/collections/conversations/items')
      .set('X-API-Key', keyA)
      .send({
        items: [
          { text: 'quiero pedir una pizza grande de muzzarella', metadata: { personId: 'p1' } },
          { text: 'mi factura llegó con un error en el importe', metadata: { personId: 'p1' } },
          { text: 'quiero pedir una pizza chica', metadata: { personId: 'p2' } },
        ],
      })
      .expect(202);
    expect(added.body.items).toHaveLength(3);
    expect(added.body.items[0].status).toBe('pending');

    await vi.waitFor(
      async () => {
        for (const { id } of added.body.items) {
          const item = await http().get(`/collections/conversations/items/${id}`).set('X-API-Key', keyA).expect(200);
          expect(item.body.status).toBe('ready');
        }
      },
      { timeout: 15000, interval: 200 },
    );

    const all = await http()
      .post('/collections/conversations/search')
      .set('X-API-Key', keyA)
      .send({ query: 'pizza grande', topK: 3 })
      .expect(200);
    expect(all.body.results[0].text).toBe('quiero pedir una pizza grande de muzzarella');
    expect(all.body.results[0].score).toBeGreaterThan(all.body.results[2].score);

    const onlyP2 = await http()
      .post('/collections/conversations/search')
      .set('X-API-Key', keyA)
      .send({ query: 'pizza grande', filter: { personId: 'p2' } })
      .expect(200);
    expect(onlyP2.body.results.map((r: { text: string }) => r.text)).toEqual(['quiero pedir una pizza chica']);
  });

  it('aísla los datos entre tenants', async () => {
    await http().get('/collections').set('X-API-Key', keyB).expect(200).expect([]);
    await http()
      .post('/collections/conversations/search')
      .set('X-API-Key', keyB)
      .send({ query: 'pizza grande' })
      .expect(404);
    await http()
      .post('/collections/conversations/items')
      .set('X-API-Key', keyB)
      .send({ items: [{ text: 'hola' }] })
      .expect(404);
  });

  it('valida el cuerpo de las requests', async () => {
    await http().post('/collections/conversations/items').set('X-API-Key', keyA).send({ items: [] }).expect(400);
    await http().post('/collections/conversations/search').set('X-API-Key', keyA).send({}).expect(400);
  });
});
```

- [ ] **Step 4: Correr el e2e**

Run: `pnpm test:e2e`
Expected: PASS (5 tests). Si falla por la inyección de `PrismaService`/`TenantAccessPort` con `strict: false`, confirmar que `RagApiModule` importa los módulos correspondientes (Tasks 6, 9). Si el orden de resultados de "pizza grande" fallara por una colisión de hash del embedding falso, cambiar el texto de la consulta y de los ítems por palabras que no compartan `hash % 64`, sin tocar el código de producción.

- [ ] **Step 5: Crear `Dockerfile` y el servicio `api` en el compose**

```dockerfile
# Dockerfile
FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm exec prisma generate && pnpm run build
EXPOSE 3100
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
```

Agregar este servicio dentro de `services:` en `docker-compose.yml`:

```yaml
  api:
    build: .
    restart: unless-stopped
    ports:
      - "3100:3100"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${DB_USER:-rag}:${DB_PASSWORD:-rag}@db:5432/${DB_NAME:-rag}
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis
```

- [ ] **Step 6: Verificar el arranque real con Docker**

```bash
docker compose up -d --build
docker compose logs api --tail 20
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/collections
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/docs
```
Expected: los logs muestran `RAG Service running`; el primer `curl` devuelve `401` (hay que autenticarse) y el segundo `200` (Swagger).

- [ ] **Step 7: Escribir `README.md` y `CLAUDE_CONTEXT.md`**

`README.md` (incluir, en español): qué es el servicio; cómo levantarlo (`cp .env.example .env`, `docker compose up -d`, `pnpm install`, `pnpm exec prisma migrate deploy`, `pnpm start:dev`); cómo crear un tenant (`pnpm build && pnpm tenant:create "<nombre>"`, la key se muestra una sola vez); la tabla de endpoints de la Fase 1 con un ejemplo `curl` por endpoint; cómo correr los tests (`pnpm test`, `pnpm test:int`, `pnpm test:e2e`, estos dos requieren `docker compose -f docker-compose.test.yml up -d`); y la lista de lo que NO está todavía (documentos, borrado, reindexado).

`CLAUDE_CONTEXT.md` (gitignoreado, solo lo "de código"): descripción en 2 líneas, stack, estructura de carpetas (la de la sección File Structure de este plan), puertos del host, y un enlace a `../whats-app-ai-chat/docs/superpowers/specs/2026-10-07-rag-service-design.md` como fuente de verdad del diseño.

- [ ] **Step 8: Correr toda la verificación final**

```bash
pnpm test && pnpm test:int && pnpm test:e2e && pnpm build
git status --short
```
Expected: todo PASS, build sin errores y `git status` sin cambios sin commitear salvo los de este task. Verificar con `git check-ignore -v CLAUDE_CONTEXT.md` que el archivo está ignorado.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add app bootstrap, OpenAPI docs, Docker, e2e test and documentation"
```

- [ ] **Step 10: Registrar el proyecto en el índice del workspace (sin commitear)**

Agregar una entrada `rag-service` en `C:\Users\nicko\projects\PROYECTOS\CLAUDE.md` (sección "Proyectos activos"): una línea de descripción y el enlace a `rag-service/CLAUDE_CONTEXT.md`. No commitear ese cambio sin que el usuario lo pida.

---

## Criterio de aceptación de la Fase 1

Se cumple cuando, con `docker compose up -d` y un tenant creado por CLI, un cliente HTTP puede: crear una colección, agregar ítems con metadata, ver cómo pasan de `pending` a `ready` y buscarlos por significado con filtro por metadata, sin poder acceder nunca a datos de otro tenant; y `pnpm test`, `pnpm test:int` y `pnpm test:e2e` pasan.
