# Arquitectura Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir multi-tenancy en whats-app-ai-chat: persistencia con Prisma+PostgreSQL para Tenant/WhatsAppNumber/Person/Instructions, memoria conversacional efímera en Redis, credenciales por tenant detrás de un `SecretsPort`, y actualizar el guard/use-case/adapters existentes para resolver el tenant en cada mensaje.

**Architecture:** Clean Architecture ya establecida en el repo (`core/domain` → `core/use-case` → `infrastructure`/`controller`). Cada pieza de persistencia nueva se expone a `core` como un puerto (`abstract class`); Prisma, Redis y el stub de secretos son adapters en `infrastructure`, bindeados con el patrón `useExisting` ya usado en el proyecto (`GeminiModule`, `WhatsAppModule`).

**Tech Stack:** NestJS 12 + TypeScript (ESM, `"type": "module"`, imports relativos con `.js`), Vitest 4, `@prisma/client` + `prisma` (PostgreSQL), `ioredis` (Redis).

**Spec:** `docs/superpowers/specs/2026-09-14-multitenant-architecture-design.md`

## Global Constraints

- Regla de dependencia: `core/domain` no importa nada de `core/use-case`, `infrastructure` ni `controller`. `core/use-case` puede importar `core/domain`, nunca `infrastructure`/`controller`.
- Todo puerto es una `abstract class`, nunca una `interface` de TypeScript (necesita sobrevivir a la compilación como token de DI).
- Un adapter se bindea a su puerto con `{ provide: AbstractPort, useExisting: ConcreteService }`, y el módulo exporta el puerto, nunca la clase concreta.
- Los specs de un consumidor de un puerto mockean el puerto (`useValue`); los specs de un adapter concreto mockean sus propias dependencias externas (el cliente de Prisma, el cliente de Redis), nunca el puerto que implementan.
- Imports relativos terminan en `.js` (ESM + `moduleResolution: nodenext`), igual que el resto del repo.
- Fuera de alcance (no tocar en este plan): facturación/pagos, CRUD de administración de tenants, integración real de Azure Key Vault, mensajes de grupo de WhatsApp, versionado de `Instructions`.
- TTL de memoria conversacional: **6 horas** (21600s), configurable vía `MESSAGE_MEMORY_TTL_SECONDS` en `.env` (no estaba fijado en el spec; se define acá como valor concreto).
- El stub de `SecretsPort` resuelve el secreto leyendo la referencia (`ref`) como nombre de variable de entorno vía `ConfigService.get(ref)` — la migración a Azure Key Vault más adelante solo reemplaza este adapter.

---

## Task 1: Esquema de Prisma y cliente generado

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json` (dependencias)
- Modify: `.env` (agregar `DATABASE_URL`)
- Modify: `.gitignore` (agregar `/generated` si Prisma genera ahí, y confirmar que `.env` ya está ignorado)

**Interfaces:**
- Produces: el cliente `@prisma/client` con los modelos `Tenant`, `WhatsAppNumber`, `Person`, `Instructions`, tipados, importable como `import { PrismaClient } from '@prisma/client'`.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

- [ ] **Step 2: Inicializar Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

Esto crea `prisma/schema.prisma` y agrega `DATABASE_URL` a `.env` (si `.env` ya existe, Prisma la agrega al final).

- [ ] **Step 3: Reemplazar el contenido de `prisma/schema.prisma` con el esquema real**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id              String          @id @default(uuid())
  name            String
  active          Boolean         @default(true)
  createdAt       DateTime        @default(now())
  whatsAppNumbers WhatsAppNumber[]
  people          Person[]
  instructions    Instructions?
}

model WhatsAppNumber {
  id                    String  @id @default(uuid())
  tenantId              String
  tenant                Tenant  @relation(fields: [tenantId], references: [id])
  phoneNumber           String  @unique
  wabaId                String  @unique
  ycloudApiKeySecretRef String
  webhookSecretRef      String
  active                Boolean @default(true)

  @@index([tenantId])
}

model Person {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  phoneNumber String
  name        String?
  createdAt   DateTime @default(now())

  @@unique([tenantId, phoneNumber])
}

model Instructions {
  id        String   @id @default(uuid())
  tenantId  String   @unique
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  content   String
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: Confirmar que `DATABASE_URL` quedó en `.env`**

Revisar que `.env` tenga una línea `DATABASE_URL="postgresql://..."` (Prisma la agrega con un valor de ejemplo — reemplazar por la conexión real de Postgres cuando esté disponible; no es necesaria una conexión real para el resto de este plan, ver Step 5).

- [ ] **Step 5: Generar el cliente (no requiere conexión a una DB real)**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` sin errores — confirma que el schema es válido y el cliente tipado queda disponible en `node_modules/@prisma/client`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma package.json pnpm-lock.yaml .env.example
git commit -m "feat: add Prisma schema for Tenant/WhatsAppNumber/Person/Instructions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(No se agrega `.env` real al commit — ya está en `.gitignore`. Si no existe un `.env.example`, crear uno con `DATABASE_URL=` vacío como referencia para el equipo.)

---

## Task 2: `PrismaService` y `PrismaModule`

**Files:**
- Create: `src/infrastructure/persistence/prisma/prisma.service.ts`
- Create: `src/infrastructure/persistence/prisma/prisma.module.ts`
- Test: `src/infrastructure/persistence/prisma/prisma.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaClient` de `@prisma/client`.
- Produces: `PrismaService` (inyectable, `provide: PrismaService`), `PrismaModule` (`exports: [PrismaService]`) — usado por las tareas 4, 5 y 6.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/persistence/prisma/prisma.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('exposes the tenant delegate from PrismaClient', () => {
    expect(service.tenant).toBeDefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/prisma/prisma.service.spec.ts`
Expected: FAIL — `Cannot find module './prisma.service.js'`

- [ ] **Step 3: Implementar `PrismaService`**

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

- [ ] **Step 4: Crear `PrismaModule`**

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

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/prisma/prisma.service.spec.ts`
Expected: PASS (2 tests) — no requiere una conexión real a Postgres porque `Test.createTestingModule` no llama a `onModuleInit`.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/persistence/prisma/
git commit -m "feat: add PrismaService wrapper and PrismaModule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Entidades de dominio nuevas

**Files:**
- Create: `src/core/domain/entities/tenant.entity.ts`
- Create: `src/core/domain/entities/whats-app-number.entity.ts`
- Create: `src/core/domain/entities/person.entity.ts`
- Create: `src/core/domain/entities/instructions.entity.ts`
- Create: `src/core/domain/entities/conversation-message.entity.ts`
- Test: `src/core/domain/entities/entities.spec.ts`

**Interfaces:**
- Produces: `Tenant`, `WhatsAppNumber`, `Person`, `Instructions`, `ConversationMessage` — usados por los puertos y repositorios de las tareas 4-9, y por el use-case en la tarea 12.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/core/domain/entities/entities.spec.ts
import { Tenant } from './tenant.entity.js';
import { WhatsAppNumber } from './whats-app-number.entity.js';
import { Person } from './person.entity.js';
import { Instructions } from './instructions.entity.js';
import { ConversationMessage } from './conversation-message.entity.js';

describe('multi-tenant domain entities', () => {
  it('construye un Tenant', () => {
    const tenant: Tenant = { id: 't1', name: 'Acme', active: true, createdAt: new Date() };
    expect(tenant.name).toBe('Acme');
  });

  it('construye un WhatsAppNumber ligado a un tenant', () => {
    const number: WhatsAppNumber = {
      id: 'w1', tenantId: 't1', phoneNumber: '+15551234567', wabaId: 'waba1',
      ycloudApiKeySecretRef: 'TENANT_T1_API_KEY', webhookSecretRef: 'TENANT_T1_WEBHOOK_SECRET', active: true,
    };
    expect(number.tenantId).toBe('t1');
  });

  it('construye una Person ligada a un tenant', () => {
    const person: Person = { id: 'p1', tenantId: 't1', phoneNumber: '+15550000000', createdAt: new Date() };
    expect(person.tenantId).toBe('t1');
  });

  it('construye Instructions ligadas a un tenant', () => {
    const instructions: Instructions = { id: 'i1', tenantId: 't1', content: 'Sos un asistente de Acme.', updatedAt: new Date() };
    expect(instructions.content).toContain('Acme');
  });

  it('construye un ConversationMessage', () => {
    const message: ConversationMessage = { role: 'inbound', text: 'hola', timestamp: new Date() };
    expect(message.role).toBe('inbound');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/domain/entities/entities.spec.ts`
Expected: FAIL — no se encuentran los módulos de las entidades.

- [ ] **Step 3: Implementar las entidades**

```ts
// src/core/domain/entities/tenant.entity.ts
export class Tenant {
    id: string;
    name: string;
    active: boolean;
    createdAt: Date;
}
```

```ts
// src/core/domain/entities/whats-app-number.entity.ts
export class WhatsAppNumber {
    id: string;
    tenantId: string;
    phoneNumber: string;
    wabaId: string;
    ycloudApiKeySecretRef: string;
    webhookSecretRef: string;
    active: boolean;
}
```

```ts
// src/core/domain/entities/person.entity.ts
export class Person {
    id: string;
    tenantId: string;
    phoneNumber: string;
    name?: string;
    createdAt: Date;
}
```

```ts
// src/core/domain/entities/instructions.entity.ts
export class Instructions {
    id: string;
    tenantId: string;
    content: string;
    updatedAt: Date;
}
```

```ts
// src/core/domain/entities/conversation-message.entity.ts
export type ConversationMessageRole = 'inbound' | 'outbound';

export class ConversationMessage {
    role: ConversationMessageRole;
    text: string;
    timestamp: Date;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/domain/entities/entities.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/domain/entities/
git commit -m "feat: add multi-tenant domain entities (Tenant, WhatsAppNumber, Person, Instructions, ConversationMessage)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `WhatsAppNumberRepositoryPort` + adapter de Prisma

**Files:**
- Create: `src/core/domain/ports/whats-app-number-port/whats-app-number.port.ts`
- Create: `src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.ts`
- Create: `src/infrastructure/persistence/prisma/whats-app-number-repository.module.ts`
- Test: `src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `WhatsAppNumber` (Task 3).
- Produces: `WhatsAppNumberRepositoryPort` (usado por el guard en Task 11 y por `WhatsAppService` en Task 13), token `WhatsAppNumberRepositoryModule` que exporta el puerto.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { WhatsAppNumberPrismaRepository } from './whats-app-number-prisma.repository.js';

describe('WhatsAppNumberPrismaRepository', () => {
  let repository: WhatsAppNumberPrismaRepository;
  const prismaMock = {
    whatsAppNumber: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppNumberPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<WhatsAppNumberPrismaRepository>(WhatsAppNumberPrismaRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('findByExternalId busca por wabaId o phoneNumber y devuelve null si no existe', async () => {
    prismaMock.whatsAppNumber.findFirst.mockResolvedValueOnce(null);

    const result = await repository.findByExternalId('unknown-waba-id');

    expect(result).toBeNull();
    expect(prismaMock.whatsAppNumber.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ wabaId: 'unknown-waba-id' }, { phoneNumber: 'unknown-waba-id' }] },
    });
  });

  it('findByExternalId devuelve el WhatsAppNumber encontrado', async () => {
    const record = {
      id: 'w1', tenantId: 't1', phoneNumber: '+15551234567', wabaId: 'waba1',
      ycloudApiKeySecretRef: 'REF_API', webhookSecretRef: 'REF_WEBHOOK', active: true,
    };
    prismaMock.whatsAppNumber.findFirst.mockResolvedValueOnce(record);

    const result = await repository.findByExternalId('waba1');

    expect(result).toEqual(record);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el puerto**

```ts
// src/core/domain/ports/whats-app-number-port/whats-app-number.port.ts
import { WhatsAppNumber } from '../../entities/whats-app-number.entity.js';

export abstract class WhatsAppNumberRepositoryPort {
    abstract findByExternalId(wabaIdOrPhone: string): Promise<WhatsAppNumber | null>;
}
```

- [ ] **Step 4: Implementar el adapter de Prisma**

```ts
// src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { WhatsAppNumber } from '../../../core/domain/entities/whats-app-number.entity.js';

@Injectable()
export class WhatsAppNumberPrismaRepository implements WhatsAppNumberRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async findByExternalId(wabaIdOrPhone: string): Promise<WhatsAppNumber | null> {
        return this.prisma.whatsAppNumber.findFirst({
            where: { OR: [{ wabaId: wabaIdOrPhone }, { phoneNumber: wabaIdOrPhone }] },
        });
    }
}
```

- [ ] **Step 5: Crear el módulo que bindea el puerto**

```ts
// src/infrastructure/persistence/prisma/whats-app-number-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { WhatsAppNumberPrismaRepository } from './whats-app-number-prisma.repository.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        WhatsAppNumberPrismaRepository,
        { provide: WhatsAppNumberRepositoryPort, useExisting: WhatsAppNumberPrismaRepository },
    ],
    exports: [WhatsAppNumberRepositoryPort],
})
export class WhatsAppNumberRepositoryModule {}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/ports/whats-app-number-port/ src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.ts src/infrastructure/persistence/prisma/whats-app-number-repository.module.ts src/infrastructure/persistence/prisma/whats-app-number-prisma.repository.spec.ts
git commit -m "feat: add WhatsAppNumberRepositoryPort with Prisma adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `PersonRepositoryPort` + adapter de Prisma

**Files:**
- Create: `src/core/domain/ports/person-port/person.port.ts`
- Create: `src/infrastructure/persistence/prisma/person-prisma.repository.ts`
- Create: `src/infrastructure/persistence/prisma/person-repository.module.ts`
- Test: `src/infrastructure/persistence/prisma/person-prisma.repository.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `Person` (Task 3).
- Produces: `PersonRepositoryPort` (usado por el use-case en Task 12).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/persistence/prisma/person-prisma.repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { PersonPrismaRepository } from './person-prisma.repository.js';

describe('PersonPrismaRepository', () => {
  let repository: PersonPrismaRepository;
  const prismaMock = {
    person: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<PersonPrismaRepository>(PersonPrismaRepository);
  });

  it('findOrCreate devuelve la persona existente si ya está', async () => {
    const existing = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', name: null, createdAt: new Date() };
    prismaMock.person.findUnique.mockResolvedValueOnce(existing);

    const result = await repository.findOrCreate('t1', '+1555');

    expect(result).toEqual(existing);
    expect(prismaMock.person.create).not.toHaveBeenCalled();
  });

  it('findOrCreate crea la persona si no existe', async () => {
    const created = { id: 'p2', tenantId: 't1', phoneNumber: '+1556', name: 'Nico', createdAt: new Date() };
    prismaMock.person.findUnique.mockResolvedValueOnce(null);
    prismaMock.person.create.mockResolvedValueOnce(created);

    const result = await repository.findOrCreate('t1', '+1556', 'Nico');

    expect(result).toEqual(created);
    expect(prismaMock.person.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', phoneNumber: '+1556', name: 'Nico' },
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/prisma/person-prisma.repository.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el puerto**

```ts
// src/core/domain/ports/person-port/person.port.ts
import { Person } from '../../entities/person.entity.js';

export abstract class PersonRepositoryPort {
    abstract findOrCreate(tenantId: string, phoneNumber: string, name?: string): Promise<Person>;
}
```

- [ ] **Step 4: Implementar el adapter de Prisma**

```ts
// src/infrastructure/persistence/prisma/person-prisma.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';
import { Person } from '../../../core/domain/entities/person.entity.js';

@Injectable()
export class PersonPrismaRepository implements PersonRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async findOrCreate(tenantId: string, phoneNumber: string, name?: string): Promise<Person> {
        const existing = await this.prisma.person.findUnique({
            where: { tenantId_phoneNumber: { tenantId, phoneNumber } },
        });

        if (existing) {
            return existing;
        }

        return this.prisma.person.create({
            data: { tenantId, phoneNumber, name },
        });
    }
}
```

- [ ] **Step 5: Crear el módulo que bindea el puerto**

```ts
// src/infrastructure/persistence/prisma/person-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { PersonPrismaRepository } from './person-prisma.repository.js';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        PersonPrismaRepository,
        { provide: PersonRepositoryPort, useExisting: PersonPrismaRepository },
    ],
    exports: [PersonRepositoryPort],
})
export class PersonRepositoryModule {}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/prisma/person-prisma.repository.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/ports/person-port/ src/infrastructure/persistence/prisma/person-prisma.repository.ts src/infrastructure/persistence/prisma/person-repository.module.ts src/infrastructure/persistence/prisma/person-prisma.repository.spec.ts
git commit -m "feat: add PersonRepositoryPort with Prisma adapter (findOrCreate)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `InstructionsRepositoryPort` + adapter de Prisma

**Files:**
- Create: `src/core/domain/ports/instructions-port/instructions.port.ts`
- Create: `src/infrastructure/persistence/prisma/instructions-prisma.repository.ts`
- Create: `src/infrastructure/persistence/prisma/instructions-repository.module.ts`
- Test: `src/infrastructure/persistence/prisma/instructions-prisma.repository.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `Instructions` (Task 3).
- Produces: `InstructionsRepositoryPort` (usado por el use-case en Task 12).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/persistence/prisma/instructions-prisma.repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { InstructionsPrismaRepository } from './instructions-prisma.repository.js';

describe('InstructionsPrismaRepository', () => {
  let repository: InstructionsPrismaRepository;
  const prismaMock = {
    instructions: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstructionsPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<InstructionsPrismaRepository>(InstructionsPrismaRepository);
  });

  it('getForTenant devuelve null si el tenant no tiene instrucciones', async () => {
    prismaMock.instructions.findUnique.mockResolvedValueOnce(null);

    const result = await repository.getForTenant('t1');

    expect(result).toBeNull();
  });

  it('getForTenant devuelve las instrucciones del tenant', async () => {
    const record = { id: 'i1', tenantId: 't1', content: 'Sos el asistente de Acme.', updatedAt: new Date() };
    prismaMock.instructions.findUnique.mockResolvedValueOnce(record);

    const result = await repository.getForTenant('t1');

    expect(result).toEqual(record);
    expect(prismaMock.instructions.findUnique).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/prisma/instructions-prisma.repository.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el puerto**

```ts
// src/core/domain/ports/instructions-port/instructions.port.ts
import { Instructions } from '../../entities/instructions.entity.js';

export abstract class InstructionsRepositoryPort {
    abstract getForTenant(tenantId: string): Promise<Instructions | null>;
}
```

- [ ] **Step 4: Implementar el adapter de Prisma**

```ts
// src/infrastructure/persistence/prisma/instructions-prisma.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';
import { Instructions } from '../../../core/domain/entities/instructions.entity.js';

@Injectable()
export class InstructionsPrismaRepository implements InstructionsRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async getForTenant(tenantId: string): Promise<Instructions | null> {
        return this.prisma.instructions.findUnique({ where: { tenantId } });
    }
}
```

- [ ] **Step 5: Crear el módulo que bindea el puerto**

```ts
// src/infrastructure/persistence/prisma/instructions-repository.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { InstructionsPrismaRepository } from './instructions-prisma.repository.js';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        InstructionsPrismaRepository,
        { provide: InstructionsRepositoryPort, useExisting: InstructionsPrismaRepository },
    ],
    exports: [InstructionsRepositoryPort],
})
export class InstructionsRepositoryModule {}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/prisma/instructions-prisma.repository.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/ports/instructions-port/ src/infrastructure/persistence/prisma/instructions-prisma.repository.ts src/infrastructure/persistence/prisma/instructions-repository.module.ts src/infrastructure/persistence/prisma/instructions-prisma.repository.spec.ts
git commit -m "feat: add InstructionsRepositoryPort with Prisma adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `SecretsPort` + adapter stub (lee de variables de entorno)

**Files:**
- Create: `src/core/domain/ports/secrets-port/secrets.port.ts`
- Create: `src/infrastructure/extern/secrets/env-secrets.service.ts`
- Create: `src/infrastructure/extern/secrets/secrets.module.ts`
- Test: `src/infrastructure/extern/secrets/env-secrets.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (`@nestjs/config`, ya usado en el proyecto).
- Produces: `SecretsPort` (usado por el guard en Task 11 y por `WhatsAppService` en Task 13).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/extern/secrets/env-secrets.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnvSecretsService } from './env-secrets.service.js';

describe('EnvSecretsService', () => {
  let service: EnvSecretsService;
  const configMock = { get: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvSecretsService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<EnvSecretsService>(EnvSecretsService);
  });

  it('getSecret resuelve el valor leyendo la referencia como variable de entorno', async () => {
    configMock.get.mockReturnValueOnce('el-valor-secreto');

    const result = await service.getSecret('TENANT_T1_WEBHOOK_SECRET');

    expect(result).toBe('el-valor-secreto');
    expect(configMock.get).toHaveBeenCalledWith('TENANT_T1_WEBHOOK_SECRET');
  });

  it('getSecret tira un error si la referencia no existe', async () => {
    configMock.get.mockReturnValueOnce(undefined);

    await expect(service.getSecret('NO_EXISTE')).rejects.toThrow('Secret not found for ref: NO_EXISTE');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/extern/secrets/env-secrets.service.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el puerto**

```ts
// src/core/domain/ports/secrets-port/secrets.port.ts
export abstract class SecretsPort {
    abstract getSecret(ref: string): Promise<string>;
}
```

- [ ] **Step 4: Implementar el adapter stub**

```ts
// src/infrastructure/extern/secrets/env-secrets.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

@Injectable()
export class EnvSecretsService implements SecretsPort {
    constructor(private readonly config: ConfigService) {}

    async getSecret(ref: string): Promise<string> {
        const value = this.config.get<string>(ref);

        if (!value) {
            throw new Error(`Secret not found for ref: ${ref}`);
        }

        return value;
    }
}
```

Nota para cuando se integre Azure Key Vault: este adapter es el único que se reemplaza — `SecretsPort` y todo lo que lo consume queda igual.

- [ ] **Step 5: Crear el módulo que bindea el puerto**

```ts
// src/infrastructure/extern/secrets/secrets.module.ts
import { Module } from '@nestjs/common';
import { EnvSecretsService } from './env-secrets.service.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

@Module({
    providers: [
        EnvSecretsService,
        { provide: SecretsPort, useExisting: EnvSecretsService },
    ],
    exports: [SecretsPort],
})
export class SecretsModule {}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/extern/secrets/env-secrets.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/ports/secrets-port/ src/infrastructure/extern/secrets/
git commit -m "feat: add SecretsPort with env-var-backed stub adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Cliente de Redis (`RedisService` + `RedisModule`)

**Files:**
- Modify: `package.json` (agregar `ioredis`)
- Modify: `.env` (agregar `REDIS_URL`, `MESSAGE_MEMORY_TTL_SECONDS`)
- Create: `src/infrastructure/persistence/redis/redis.service.ts`
- Create: `src/infrastructure/persistence/redis/redis.module.ts`
- Test: `src/infrastructure/persistence/redis/redis.service.spec.ts`

**Interfaces:**
- Produces: `RedisService` (envuelve un cliente `ioredis`, `exports: [RedisService]`) — usado por Task 9.

- [ ] **Step 1: Instalar dependencia**

```bash
pnpm add ioredis
```

- [ ] **Step 2: Agregar variables de entorno**

Agregar a `.env`:
```
REDIS_URL = redis://localhost:6379
MESSAGE_MEMORY_TTL_SECONDS = 21600
```

- [ ] **Step 3: Escribir el test que falla**

```ts
// src/infrastructure/persistence/redis/redis.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  const configMock = { get: vi.fn().mockReturnValue('redis://localhost:6379') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    await service.getClient().quit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('expone un cliente ioredis construido con REDIS_URL', () => {
    expect(service.getClient()).toBeDefined();
    expect(configMock.get).toHaveBeenCalledWith('REDIS_URL');
  });
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/redis/redis.service.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 5: Implementar `RedisService`**

```ts
// src/infrastructure/persistence/redis/redis.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly client: Redis;

    constructor(private readonly config: ConfigService) {
        this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
    }

    getClient(): Redis {
        return this.client;
    }

    async onModuleDestroy() {
        await this.client.quit();
    }
}
```

- [ ] **Step 6: Crear `RedisModule`**

```ts
// src/infrastructure/persistence/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Module({
    providers: [RedisService],
    exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/redis/redis.service.spec.ts`
Expected: PASS (2 tests). Nota: `ioredis` intenta conectar en background pero no bloquea la construcción del cliente ni el test — si no hay Redis corriendo local, va a reintentar en segundo plano sin hacer fallar el test (el test solo verifica que el objeto se construyó).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/infrastructure/persistence/redis/ .env.example
git commit -m "feat: add RedisService wrapper and RedisModule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `MessageMemoryPort` + adapter de Redis

**Files:**
- Create: `src/core/domain/ports/message-memory-port/message-memory.port.ts`
- Create: `src/infrastructure/persistence/redis/message-memory-redis.repository.ts`
- Create: `src/infrastructure/persistence/redis/message-memory-repository.module.ts`
- Test: `src/infrastructure/persistence/redis/message-memory-redis.repository.spec.ts`

**Interfaces:**
- Consumes: `RedisService` (Task 8), `ConversationMessage` (Task 3), `ConfigService`.
- Produces: `MessageMemoryPort` (usado por el use-case en Task 12).

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/persistence/redis/message-memory-redis.repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { MessageMemoryRedisRepository } from './message-memory-redis.repository.js';

describe('MessageMemoryRedisRepository', () => {
  let repository: MessageMemoryRedisRepository;
  const redisClientMock = {
    rpush: vi.fn(),
    ltrim: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn(),
  };
  const redisServiceMock = { getClient: () => redisClientMock };
  const configMock = { get: vi.fn().mockReturnValue('21600') };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageMemoryRedisRepository,
        { provide: RedisService, useValue: redisServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    repository = module.get<MessageMemoryRedisRepository>(MessageMemoryRedisRepository);
  });

  it('appendMessage guarda el mensaje en la lista y renueva el TTL', async () => {
    const message = { role: 'inbound' as const, text: 'hola', timestamp: new Date('2026-09-14T00:00:00Z') };

    await repository.appendMessage('t1', 'p1', message);

    expect(redisClientMock.rpush).toHaveBeenCalledWith('conv:t1:p1', JSON.stringify(message));
    expect(redisClientMock.ltrim).toHaveBeenCalledWith('conv:t1:p1', -20, -1);
    expect(redisClientMock.expire).toHaveBeenCalledWith('conv:t1:p1', 21600);
  });

  it('getRecentMessages devuelve la lista de mensajes deserializados', async () => {
    const stored = [
      JSON.stringify({ role: 'inbound', text: 'hola', timestamp: '2026-09-14T00:00:00.000Z' }),
      JSON.stringify({ role: 'outbound', text: 'hola, en qué te ayudo?', timestamp: '2026-09-14T00:00:01.000Z' }),
    ];
    redisClientMock.lrange.mockResolvedValueOnce(stored);

    const result = await repository.getRecentMessages('t1', 'p1');

    expect(redisClientMock.lrange).toHaveBeenCalledWith('conv:t1:p1', 0, -1);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('hola');
  });

  it('getRecentMessages devuelve un array vacío si no hay historial', async () => {
    redisClientMock.lrange.mockResolvedValueOnce([]);

    const result = await repository.getRecentMessages('t1', 'p2');

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/persistence/redis/message-memory-redis.repository.spec.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el puerto**

```ts
// src/core/domain/ports/message-memory-port/message-memory.port.ts
import { ConversationMessage } from '../../entities/conversation-message.entity.js';

export abstract class MessageMemoryPort {
    abstract getRecentMessages(tenantId: string, personId: string): Promise<ConversationMessage[]>;
    abstract appendMessage(tenantId: string, personId: string, message: ConversationMessage): Promise<void>;
}
```

- [ ] **Step 4: Implementar el adapter de Redis**

```ts
// src/infrastructure/persistence/redis/message-memory-redis.repository.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { MessageMemoryPort } from '../../../core/domain/ports/message-memory-port/message-memory.port.js';
import { ConversationMessage } from '../../../core/domain/entities/conversation-message.entity.js';

const MAX_MESSAGES_PER_CONVERSATION = 20;

@Injectable()
export class MessageMemoryRedisRepository implements MessageMemoryPort {
    constructor(
        private readonly redis: RedisService,
        private readonly config: ConfigService,
    ) {}

    private key(tenantId: string, personId: string): string {
        return `conv:${tenantId}:${personId}`;
    }

    async appendMessage(tenantId: string, personId: string, message: ConversationMessage): Promise<void> {
        const key = this.key(tenantId, personId);
        const ttlSeconds = Number(this.config.get<string>('MESSAGE_MEMORY_TTL_SECONDS') ?? '21600');
        const client = this.redis.getClient();

        await client.rpush(key, JSON.stringify(message));
        await client.ltrim(key, -MAX_MESSAGES_PER_CONVERSATION, -1);
        await client.expire(key, ttlSeconds);
    }

    async getRecentMessages(tenantId: string, personId: string): Promise<ConversationMessage[]> {
        const key = this.key(tenantId, personId);
        const raw = await this.redis.getClient().lrange(key, 0, -1);

        return raw.map((entry) => JSON.parse(entry) as ConversationMessage);
    }
}
```

- [ ] **Step 5: Crear el módulo que bindea el puerto**

```ts
// src/infrastructure/persistence/redis/message-memory-repository.module.ts
import { Module } from '@nestjs/common';
import { RedisModule } from './redis.module.js';
import { MessageMemoryRedisRepository } from './message-memory-redis.repository.js';
import { MessageMemoryPort } from '../../../core/domain/ports/message-memory-port/message-memory.port.js';

@Module({
    imports: [RedisModule],
    providers: [
        MessageMemoryRedisRepository,
        { provide: MessageMemoryPort, useExisting: MessageMemoryRedisRepository },
    ],
    exports: [MessageMemoryPort],
})
export class MessageMemoryRepositoryModule {}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/persistence/redis/message-memory-redis.repository.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/ports/message-memory-port/ src/infrastructure/persistence/redis/message-memory-redis.repository.ts src/infrastructure/persistence/redis/message-memory-repository.module.ts src/infrastructure/persistence/redis/message-memory-redis.repository.spec.ts
git commit -m "feat: add MessageMemoryPort with Redis-backed adapter (TTL memory)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Actualizar `AiPort`/`AiSelectedPort` para aceptar `instructions`/`history`

**Files:**
- Modify: `src/core/domain/ports/ai-port/ai.port.ts`
- Modify: `src/infrastructure/extern/ai/ports/ai-selected.port.ts`
- Modify: `src/infrastructure/extern/ai/gemini/gemini-proxy.service.ts`
- Modify: `src/infrastructure/extern/ai/qwen/qwen.service.ts`
- Modify: `src/infrastructure/extern/ai/ai.service.ts`
- Modify: `src/infrastructure/extern/ai/gemini/gemini-proxy.service.spec.ts`
- Modify: `src/infrastructure/extern/ai/qwen/qwen.service.spec.ts`
- Modify: `src/infrastructure/extern/ai/ai.service.spec.ts`

**Interfaces:**
- Consumes: `ConversationMessage` (Task 3).
- Produces: `AiPort.generateMessage(message, options)` — firma nueva consumida por el use-case en Task 12.

- [ ] **Step 1: Escribir el test que falla (actualizar `ai.service.spec.ts`)**

```ts
// src/infrastructure/extern/ai/ai.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service.js';
import { GEMINI_AI_PORT } from './gemini/gemini-proxy.module.js';
import { QWEN_AI_PORT } from './qwen/qwen.module.js';

describe('AiService', () => {
  let service: AiService;
  const geminiMock = { generateMessage: vi.fn() };
  const qwenMock = { generateMessage: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: GEMINI_AI_PORT, useValue: geminiMock },
        { provide: QWEN_AI_PORT, useValue: qwenMock },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateMessage reenvía instructions e history al proveedor elegido', async () => {
    qwenMock.generateMessage.mockResolvedValueOnce('respuesta');
    const history = [{ role: 'inbound' as const, text: 'hola', timestamp: new Date() }];

    const result = await service.generateMessage('mensaje', { instructions: 'sé breve', history });

    expect(result).toBe('respuesta');
    expect(qwenMock.generateMessage).toHaveBeenCalledWith('mensaje', { instructions: 'sé breve', history });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/extern/ai/ai.service.spec.ts`
Expected: FAIL — `generateMessage` no acepta un segundo argumento en la implementación actual, el mock no matchea la llamada.

- [ ] **Step 3: Actualizar `AiPort`**

```ts
// src/core/domain/ports/ai-port/ai.port.ts
import { ConversationMessage } from '../../entities/conversation-message.entity.js';

export interface AiGenerateOptions {
    instructions?: string;
    history?: ConversationMessage[];
}

export abstract class AiPort {
    abstract generateMessage(message: string, options?: AiGenerateOptions): Promise<string>;
}
```

- [ ] **Step 4: Actualizar `AiSelectedPort`**

```ts
// src/infrastructure/extern/ai/ports/ai-selected.port.ts
import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';

export abstract class AiSelectedPort {
    abstract generateMessage(message: string, options?: AiGenerateOptions): Promise<string>;
}
```

- [ ] **Step 5: Actualizar `AiService` para reenviar las opciones**

```ts
// src/infrastructure/extern/ai/ai.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { AiGenerateOptions, AiPort } from '../../../core/domain/ports/ai-port/ai.port.js';
import { AiSelectedPort } from './ports/ai-selected.port.js';
import { GEMINI_AI_PORT } from './gemini/gemini-proxy.module.js';
import { QWEN_AI_PORT } from './qwen/qwen.module.js';

@Injectable()
export class AiService implements AiPort {

    constructor(
        @Inject(GEMINI_AI_PORT) private readonly geminiProvider: AiSelectedPort,
        @Inject(QWEN_AI_PORT) private readonly qwenProvider: AiSelectedPort,
    ) {}

    private getProvider(): AiSelectedPort {
        return this.qwenProvider;
    }

    public async generateMessage(message: string, options?: AiGenerateOptions): Promise<string> {
        const provider = this.getProvider();
        return await provider.generateMessage(message, options);
    }
}
```

- [ ] **Step 6: Actualizar `GeminiService` (usa `instructions` como contexto de sistema; ignora `history` por ahora — Gemini se integra vía `interactions.create`, que no tiene un parámetro de historial en este SDK todavía)**

```ts
// src/infrastructure/extern/ai/gemini/gemini-proxy.service.ts
import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';
import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';

@Injectable()
export class GeminiService implements AiSelectedPort {
    constructor(private ai_gemini: GoogleGenAI) {}
    geminiModel = "gemini-3.5-flash-lite";

    async generateMessage(message: string, options?: AiGenerateOptions): Promise<string> {
        const input = options?.instructions ? `${options.instructions}\n\n${message}` : message;
        const answer = await this.ai_gemini.interactions.create({ model: this.geminiModel, input });
        return answer.output_text ?? '';
    }
}
```

- [ ] **Step 7: Actualizar `QwenService` (limpia el código de debug pendiente del `Pendientes` de la nota de Obsidian de paso — usa el parámetro `message` real, arma el input con `instructions`)**

```ts
// src/infrastructure/extern/ai/qwen/qwen.service.ts
import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';
import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';
import OpenAI from 'openai';

@Injectable()
export class QwenService implements AiSelectedPort {
    constructor(private open_ai: OpenAI) {}
    model = 'qwen3.7-flash';

    async generateMessage(message: string, options?: AiGenerateOptions): Promise<string> {
        const input = options?.instructions ? `${options.instructions}\n\n${message}` : message;
        const response = await this.open_ai.responses.create({
            model: this.model,
            input,
        });

        return response.output_text ?? '';
    }
}
```

- [ ] **Step 8: Actualizar los specs de `GeminiService` y `QwenService`**

```ts
// src/infrastructure/extern/ai/gemini/gemini-proxy.service.spec.ts — agregar este test al describe existente
it('generateMessage antepone las instructions al mensaje si vienen', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).ai_gemini = { interactions: { create: createMock } };

    await service.generateMessage('hola', { instructions: 'sé formal' });

    expect(createMock).toHaveBeenCalledWith({
      model: service.geminiModel,
      input: 'sé formal\n\nhola',
    });
});
```

```ts
// src/infrastructure/extern/ai/qwen/qwen.service.spec.ts — agregar este test al describe existente
it('generateMessage antepone las instructions al mensaje si vienen', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).open_ai = { responses: { create: createMock } };

    await service.generateMessage('hola', { instructions: 'sé formal' });

    expect(createMock).toHaveBeenCalledWith({
      model: service.model,
      input: 'sé formal\n\nhola',
    });
});
```

- [ ] **Step 9: Correr todos los tests afectados y verificar que pasan**

Run: `npx vitest run src/infrastructure/extern/ai/`
Expected: PASS (todos los specs bajo `infrastructure/extern/ai/`)

- [ ] **Step 10: Commit**

```bash
git add src/core/domain/ports/ai-port/ai.port.ts src/infrastructure/extern/ai/
git commit -m "feat: extend AiPort/AiSelectedPort to accept instructions and conversation history

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Reescribir `YCloudWebhookSignatureGuard` para resolver el tenant

**Files:**
- Modify: `src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.ts`
- Create: `src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.spec.ts`
- Modify: `src/infrastructure/extern/whats-app/whats-app-proxy.module.ts`

**Interfaces:**
- Consumes: `WhatsAppNumberRepositoryPort` (Task 4), `SecretsPort` (Task 7).
- Produces: la request ahora trae `request.whatsAppNumber: WhatsAppNumber` — consumido por el controller en Task 12.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { YCloudWebhookSignatureGuard } from './ycloud-webhook-signature.guard.js';
import { WhatsAppNumberRepositoryPort } from '../../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../../core/domain/ports/secrets-port/secrets.port.js';

function buildSignature(payload: string, secret: string): string {
  const timestamp = '1700000000';
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function buildContext(headers: Record<string, string>, rawBody: Buffer): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, rawBody, body: JSON.parse(rawBody.toString('utf8')) }),
    }),
  } as unknown as ExecutionContext;
}

describe('YCloudWebhookSignatureGuard', () => {
  let guard: YCloudWebhookSignatureGuard;
  const whatsAppNumberRepoMock = { findByExternalId: vi.fn() };
  const secretsMock = { getSecret: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YCloudWebhookSignatureGuard,
        { provide: WhatsAppNumberRepositoryPort, useValue: whatsAppNumberRepoMock },
        { provide: SecretsPort, useValue: secretsMock },
      ],
    }).compile();

    guard = module.get<YCloudWebhookSignatureGuard>(YCloudWebhookSignatureGuard);
  });

  it('rechaza si el número de WhatsApp no está registrado', async () => {
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(null);
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'unknown' } });
    const context = buildContext({ 'ycloud-signature': 't=1,v1=x' }, Buffer.from(body));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si la firma no coincide con el secreto del tenant', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', webhookSecretRef: 'REF' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('secreto-correcto');
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'waba1' } });
    const context = buildContext({ 'ycloud-signature': 't=1700000000,v1=firmaInvalida' }, Buffer.from(body));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('acepta la request y adjunta el WhatsAppNumber resuelto cuando la firma es válida', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', webhookSecretRef: 'REF' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('secreto-correcto');
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'waba1' } });
    const signature = buildSignature(body, 'secreto-correcto');
    const request = { headers: { 'ycloud-signature': signature }, rawBody: Buffer.from(body), body: JSON.parse(body) };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect((request as any).whatsAppNumber).toEqual(whatsAppNumber);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.spec.ts`
Expected: FAIL — el guard actual no resuelve tenant, `canActivate` no es `async`, no hay `whatsAppNumber` en la request.

- [ ] **Step 3: Reescribir el guard**

```ts
// src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.ts
import { CanActivate, ExecutionContext, Injectable, Inject, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { WhatsAppNumberRepositoryPort } from '../../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../../core/domain/ports/secrets-port/secrets.port.js';
import { WhatsAppNumber } from '../../../../core/domain/entities/whats-app-number.entity.js';

const YCLOUD_SIGNATURE_HEADER = 'ycloud-signature';

interface RequestWithWhatsAppNumber extends RawBodyRequest<Request> {
    whatsAppNumber?: WhatsAppNumber;
}

@Injectable()
export class YCloudWebhookSignatureGuard implements CanActivate {
    constructor(
        @Inject(WhatsAppNumberRepositoryPort) private readonly whatsAppNumberRepository: WhatsAppNumberRepositoryPort,
        @Inject(SecretsPort) private readonly secrets: SecretsPort,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithWhatsAppNumber>();
        const signatureHeader = request.headers[YCLOUD_SIGNATURE_HEADER];
        const rawBody = request.rawBody;

        if (typeof signatureHeader !== 'string' || !rawBody) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const wabaId = request.body?.whatsappInboundMessage?.wabaId;
        const whatsAppNumber = wabaId ? await this.whatsAppNumberRepository.findByExternalId(wabaId) : null;

        if (!whatsAppNumber) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const secret = await this.secrets.getSecret(whatsAppNumber.webhookSecretRef);

        if (!this.verifySignature(rawBody.toString('utf8'), signatureHeader, secret)) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        request.whatsAppNumber = whatsAppNumber;
        return true;
    }

    private verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
        const parts = signatureHeader.split(',');
        const timestamp = parts[0]?.split('=')[1];
        const signature = parts[1]?.split('=')[1];

        if (!timestamp || !signature) {
            return false;
        }

        const signedPayload = `${timestamp}.${payload}`;
        const expectedSignature = createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const receivedBuffer = Buffer.from(signature, 'hex');

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return timingSafeEqual(expectedBuffer, receivedBuffer);
    }
}
```

Nota: se usa el mismo mensaje de error genérico (`'Missing webhook signature'`) tanto para número desconocido como para header faltante, para no revelar si un número está registrado (ver spec, sección "Manejo de errores").

- [ ] **Step 4: Actualizar `WhatsAppModule` para que el guard tenga sus dependencias disponibles**

```ts
// src/infrastructure/extern/whats-app/whats-app-proxy.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whats-app-proxy.service.js';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';
import { WhatsAppNumberRepositoryModule } from '../../persistence/prisma/whats-app-number-repository.module.js';
import { SecretsModule } from '../secrets/secrets.module.js';
import { YCloudWebhookSignatureGuard } from './guards/ycloud-webhook-signature.guard.js';

@Module({
    imports: [HttpModule, ConfigModule, WhatsAppNumberRepositoryModule, SecretsModule],
    providers: [
        WhatsAppService,
        { provide: WhatsAppPort, useExisting: WhatsAppService },
        YCloudWebhookSignatureGuard,
    ],
    exports: [WhatsAppPort, YCloudWebhookSignatureGuard],
})
export class WhatsAppModule {}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/extern/whats-app/guards/ src/infrastructure/extern/whats-app/whats-app-proxy.module.ts
git commit -m "feat: resolve tenant in YCloudWebhookSignatureGuard before validating signature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Reescribir el use-case (`handleIncomingMessage`) y el controller

**Files:**
- Modify: `src/core/use-case/whats-app-message/whats-app-message.service.ts`
- Modify: `src/core/use-case/whats-app-message/whats-app-message.service.spec.ts`
- Modify: `src/controller/whatsapp-message.controller.ts`
- Modify: `src/controller/whatsapp-message.controller.spec.ts`
- Modify: `src/controller/whatsapp-message.module.ts`

**Interfaces:**
- Consumes: `PersonRepositoryPort` (Task 5), `InstructionsRepositoryPort` (Task 6), `MessageMemoryPort` (Task 9), `AiPort` con la firma nueva (Task 10), `request.whatsAppNumber` (Task 11).
- Produces: `handleIncomingMessage(tenantId, from, to, text)` — firma nueva.

- [ ] **Step 1: Escribir el test que falla (use-case)**

```ts
// src/core/use-case/whats-app-message/whats-app-message.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whats-app-message.service.js';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsRepositoryPort } from '../../domain/ports/instructions-port/instructions.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;
  const aiMock = { generateMessage: vi.fn() };
  const whatsAppMock = { sendMessage: vi.fn() };
  const personMock = { findOrCreate: vi.fn() };
  const instructionsMock = { getForTenant: vi.fn() };
  const memoryMock = { getRecentMessages: vi.fn(), appendMessage: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessagesControllerService,
        { provide: AiPort, useValue: aiMock },
        { provide: WhatsAppPort, useValue: whatsAppMock },
        { provide: PersonRepositoryPort, useValue: personMock },
        { provide: InstructionsRepositoryPort, useValue: instructionsMock },
        { provide: MessageMemoryPort, useValue: memoryMock },
      ],
    }).compile();

    service = module.get<WhatsappMessagesControllerService>(WhatsappMessagesControllerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('handleIncomingMessage arma el contexto del tenant y responde por WhatsApp', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    const instructions = { id: 'i1', tenantId: 't1', content: 'Sé breve.', updatedAt: new Date() };
    const history = [{ role: 'inbound' as const, text: 'mensaje viejo', timestamp: new Date() }];

    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(instructions);
    memoryMock.getRecentMessages.mockResolvedValueOnce(history);
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(personMock.findOrCreate).toHaveBeenCalledWith('t1', '+1555', undefined);
    expect(instructionsMock.getForTenant).toHaveBeenCalledWith('t1');
    expect(memoryMock.getRecentMessages).toHaveBeenCalledWith('t1', 'p1');
    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: 'Sé breve.', history });
    expect(memoryMock.appendMessage).toHaveBeenCalledTimes(2);
    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: 'la respuesta' }),
    );
  });

  it('handleIncomingMessage funciona sin instructions definidas para el tenant', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockResolvedValueOnce([]);
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: undefined, history: [] });
  });

  it('degrada sin memoria si Redis falla al leer el historial, y sigue respondiendo', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockRejectedValueOnce(new Error('redis down'));
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: undefined, history: [] });
    expect(whatsAppMock.sendMessage).toHaveBeenCalled();
  });

  it('no aborta la respuesta si Redis falla al guardar el mensaje', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockResolvedValueOnce([]);
    memoryMock.appendMessage.mockRejectedValue(new Error('redis down'));
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: 'la respuesta' }),
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/use-case/whats-app-message/whats-app-message.service.spec.ts`
Expected: FAIL — `handleIncomingMessage` todavía tiene la firma vieja `(from, to, text)`, y no existe manejo de fallas de `MessageMemoryPort`.

- [ ] **Step 3: Reescribir el use-case (con degradación suave si falla Redis, según el spec)**

```ts
// src/core/use-case/whats-app-message/whats-app-message.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsRepositoryPort } from '../../domain/ports/instructions-port/instructions.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';
import { ConversationMessage } from '../../domain/entities/conversation-message.entity.js';
import { WhatsAppMessageBuilder } from '../../domain/entities/whats-app-message.entity.js';

@Injectable()
export class WhatsappMessagesControllerService {
    private readonly logger = new Logger(WhatsappMessagesControllerService.name);

    constructor(
        @Inject(AiPort) private readonly aiMessageGenerator: AiPort,
        @Inject(WhatsAppPort) private readonly whatsAppService: WhatsAppPort,
        @Inject(PersonRepositoryPort) private readonly personRepository: PersonRepositoryPort,
        @Inject(InstructionsRepositoryPort) private readonly instructionsRepository: InstructionsRepositoryPort,
        @Inject(MessageMemoryPort) private readonly messageMemory: MessageMemoryPort,
    ) {}

    async handleIncomingMessage(tenantId: string, from: string, to: string, text: string, personName?: string): Promise<void> {
        const person = await this.personRepository.findOrCreate(tenantId, from, personName);
        const instructions = await this.instructionsRepository.getForTenant(tenantId);
        const history = await this.getRecentMessagesSafely(tenantId, person.id);

        const replyText = await this.aiMessageGenerator.generateMessage(text, {
            instructions: instructions?.content,
            history,
        });

        const now = new Date();
        await this.appendMessageSafely(tenantId, person.id, { role: 'inbound', text, timestamp: now });
        await this.appendMessageSafely(tenantId, person.id, { role: 'outbound', text: replyText, timestamp: now });

        const reply = new WhatsAppMessageBuilder()
            .setFromNumber(to)
            .setToNumber(from)
            .setType("text")
            .setText(replyText)
            .build();

        await this.whatsAppService.sendMessage(reply);
    }

    private async getRecentMessagesSafely(tenantId: string, personId: string): Promise<ConversationMessage[]> {
        try {
            return await this.messageMemory.getRecentMessages(tenantId, personId);
        } catch (error) {
            this.logger.warn(`No se pudo leer la memoria conversacional (tenant=${tenantId}, person=${personId}): ${error}`);
            return [];
        }
    }

    private async appendMessageSafely(tenantId: string, personId: string, message: ConversationMessage): Promise<void> {
        try {
            await this.messageMemory.appendMessage(tenantId, personId, message);
        } catch (error) {
            this.logger.warn(`No se pudo guardar el mensaje en memoria (tenant=${tenantId}, person=${personId}): ${error}`);
        }
    }
}
```

- [ ] **Step 4: Correr el test del use-case y verificar que pasa**

Run: `npx vitest run src/core/use-case/whats-app-message/whats-app-message.service.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Escribir el test que falla (controller)**

```ts
// src/controller/whatsapp-message.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';

describe('WhatsappMessagesControllerController', () => {
  let controller: WhatsappMessagesControllerController;
  const serviceMock = { handleIncomingMessage: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappMessagesControllerController],
      providers: [
        { provide: WhatsappMessagesControllerService, useValue: serviceMock },
      ],
    }).compile();

    controller = module.get<WhatsappMessagesControllerController>(WhatsappMessagesControllerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('receiveMessage pasa el tenantId resuelto por el guard al use-case', async () => {
    const event = {
      whatsappInboundMessage: {
        from: '+1555', to: '+1999', text: { body: 'hola' },
        customerProfile: { name: 'Nico' },
      },
    } as any;
    const request = { whatsAppNumber: { tenantId: 't1' } } as any;

    await controller.receiveMessage(event, request);

    expect(serviceMock.handleIncomingMessage).toHaveBeenCalledWith('t1', '+1555', '+1999', 'hola', 'Nico');
  });
});
```

- [ ] **Step 6: Correr el test del controller y verificar que falla**

Run: `npx vitest run src/controller/whatsapp-message.controller.spec.ts`
Expected: FAIL — `receiveMessage` no acepta el segundo parámetro `request`, ni lee `tenantId`.

- [ ] **Step 7: Reescribir el controller**

```ts
// src/controller/whatsapp-message.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { YCloudInboundMessageEvent } from '../infrastructure/extern/whats-app/dto/ycloud-inbound-message-event.dto.js';
import { YCloudWebhookSignatureGuard } from '../infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.js';
import { WhatsAppNumber } from '../core/domain/entities/whats-app-number.entity.js';

interface RequestWithWhatsAppNumber extends Request {
    whatsAppNumber?: WhatsAppNumber;
}

@Controller('whatsapp/webhook')
export class WhatsappMessagesControllerController {
  constructor(private readonly whatsappMessagesControllerService: WhatsappMessagesControllerService) {}

  @Post()
  @UseGuards(YCloudWebhookSignatureGuard)
  async receiveMessage(@Body() event: YCloudInboundMessageEvent, @Req() request: RequestWithWhatsAppNumber) {
    const { from, to, text, customerProfile } = event.whatsappInboundMessage;
    const tenantId = request.whatsAppNumber!.tenantId;

    await this.whatsappMessagesControllerService.handleIncomingMessage(
      tenantId,
      from,
      to,
      text.body,
      customerProfile?.name,
    );
  }
}
```

- [ ] **Step 8: Actualizar `whatsapp-message.module.ts` con los módulos de los repositorios nuevos**

```ts
// src/controller/whatsapp-message.module.ts
import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { AiModule } from '../infrastructure/extern/ai/ai.module.js';
import { WhatsAppModule } from '../infrastructure/extern/whats-app/whats-app-proxy.module.js';
import { PersonRepositoryModule } from '../infrastructure/persistence/prisma/person-repository.module.js';
import { InstructionsRepositoryModule } from '../infrastructure/persistence/prisma/instructions-repository.module.js';
import { MessageMemoryRepositoryModule } from '../infrastructure/persistence/redis/message-memory-repository.module.js';

@Module({
  imports: [AiModule, WhatsAppModule, PersonRepositoryModule, InstructionsRepositoryModule, MessageMemoryRepositoryModule],
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
```

- [ ] **Step 9: Correr el test del controller y verificar que pasa**

Run: `npx vitest run src/controller/whatsapp-message.controller.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add src/core/use-case/whats-app-message/ src/controller/
git commit -m "feat: resolve tenant context in use-case and controller (instructions, memory, per-tenant reply)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: `WhatsAppService` resuelve credenciales por tenant

**Files:**
- Modify: `src/infrastructure/extern/whats-app/whats-app-proxy.service.ts`
- Modify: `src/infrastructure/extern/whats-app/whats-app-proxy.service.spec.ts`
- Modify: `src/infrastructure/extern/whats-app/whats-app-proxy.module.ts`

**Interfaces:**
- Consumes: `WhatsAppNumberRepositoryPort` (Task 4), `SecretsPort` (Task 7).
- Produces: `WhatsAppPort.sendMessage` sin cambio de firma (spec, sección "Cambios al flujo").

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/infrastructure/extern/whats-app/whats-app-proxy.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { WhatsAppService } from './whats-app-proxy.service.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  const httpMock = { post: vi.fn().mockReturnValue(of({})) };
  const whatsAppNumberRepoMock = { findByExternalId: vi.fn() };
  const secretsMock = { getSecret: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: HttpService, useValue: httpMock },
        { provide: WhatsAppNumberRepositoryPort, useValue: whatsAppNumberRepoMock },
        { provide: SecretsPort, useValue: secretsMock },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sendMessage resuelve la API key del tenant dueño del número "from" y la manda en el header', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', ycloudApiKeySecretRef: 'REF_API' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('la-api-key-del-tenant');

    const message = { from: '+1999', to: '+1555', type: 'text', text: { body: 'hola' } } as any;
    await service.sendMessage(message);

    expect(whatsAppNumberRepoMock.findByExternalId).toHaveBeenCalledWith('+1999');
    expect(secretsMock.getSecret).toHaveBeenCalledWith('REF_API');
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.any(String),
      message,
      { headers: expect.objectContaining({ 'X-API-Key': 'la-api-key-del-tenant' }) },
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/infrastructure/extern/whats-app/whats-app-proxy.service.spec.ts`
Expected: FAIL — el service actual no depende de `WhatsAppNumberRepositoryPort` ni `SecretsPort`, y usa `ConfigService`/`API_KEY_YCLOUD` global.

- [ ] **Step 3: Reescribir `WhatsAppService`**

```ts
// src/infrastructure/extern/whats-app/whats-app-proxy.service.ts
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { WhatsAppMessage } from '../../../core/domain/entities/whats-app-message.entity.js';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

const Y_CLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages';

@Injectable()
export class WhatsAppService implements WhatsAppPort {
    constructor(
        private readonly http: HttpService,
        @Inject(WhatsAppNumberRepositoryPort) private readonly whatsAppNumberRepository: WhatsAppNumberRepositoryPort,
        @Inject(SecretsPort) private readonly secrets: SecretsPort,
    ) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const whatsAppNumber = await this.whatsAppNumberRepository.findByExternalId(message.from);

        if (!whatsAppNumber) {
            throw new Error(`No WhatsAppNumber registered for sender ${message.from}`);
        }

        const apiKey = await this.secrets.getSecret(whatsAppNumber.ycloudApiKeySecretRef);
        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'X-API-Key': apiKey,
        };

        await firstValueFrom(this.http.post(Y_CLOUD_SEND_URL, message, { headers }));
    }
}
```

Nota: `Y_CLOUD_URL` deja de venir de `.env` global porque ahora es fijo (la única variación por tenant es la API key, no la URL del endpoint de YCloud) — si en el futuro cada tenant tuviera una URL distinta, se agregaría como campo de `WhatsAppNumber` igual que las referencias de secreto.

- [ ] **Step 4: Actualizar `WhatsAppModule` (agregar `WhatsAppNumberRepositoryModule`/`SecretsModule` a los imports de `WhatsAppService`, ya se hizo en Task 11 — confirmar que sigue así)**

Este paso ya quedó resuelto en el Task 11, Step 4 — no requiere cambios adicionales acá. Solo confirmar (leer el archivo) que `WhatsAppNumberRepositoryModule` y `SecretsModule` siguen en `imports`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/infrastructure/extern/whats-app/whats-app-proxy.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/extern/whats-app/whats-app-proxy.service.ts src/infrastructure/extern/whats-app/whats-app-proxy.service.spec.ts
git commit -m "feat: resolve per-tenant YCloud credentials in WhatsAppService instead of global env vars

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Verificación final de integración

**Files:**
- Modify: `src/app.module.ts` (si hace falta agregar algún módulo que no quedó importado transitivamente)
- No crea archivos nuevos — es una tarea de verificación end-to-end de tipos y tests.

**Interfaces:**
- Consumes: todo lo de las tareas 1-13.
- Produces: build y suite de tests verdes.

- [ ] **Step 1: Revisar `app.module.ts` y confirmar que todo módulo nuevo está alcanzable**

Leer `src/app.module.ts` y confirmar que `WhatsappMessagesControllerModule` (que ya importa `AiModule`, `WhatsAppModule`, `PersonRepositoryModule`, `InstructionsRepositoryModule`, `MessageMemoryRepositoryModule` transitivamente) sigue siendo el único import de negocio necesario en `AppModule`, junto con `WhatsAppModule`/`AiModule` si se mantiene la redundancia ya documentada como pendiente menor en la nota de Obsidian (no es necesario resolverla en este plan).

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos (el único error preexistente y no relacionado es en `test/app.e2e-spec.ts`, documentado en sesiones anteriores).

- [ ] **Step 3: Suite de tests completa**

Run: `npx vitest run`
Expected: todos los test files pasan.

- [ ] **Step 4: Actualizar `docs/architecture.md`, `docs/flow.md` y `CLAUDE_CONTEXT.md`**

Agregar a `docs/architecture.md` una sección "Multi-tenancy" con el mapa de entidades/puertos nuevos (Tenant, WhatsAppNumber, Person, Instructions, ConversationMessage + los puertos de las tareas 4-9), y actualizar `docs/flow.md` con el paso de resolución de tenant en el guard. Actualizar la sección "Base de datos" de `docs/architecture.md` (ya no dice "no definida" — ahora es Prisma+PostgreSQL para datos relacionales, Redis para memoria efímera). Actualizar `CLAUDE_CONTEXT.md` con las dependencias nuevas (`@prisma/client`, `ioredis`) y la estructura de carpetas (`src/infrastructure/persistence/`).

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/flow.md CLAUDE_CONTEXT.md
git commit -m "docs: update architecture docs for multi-tenant persistence layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
