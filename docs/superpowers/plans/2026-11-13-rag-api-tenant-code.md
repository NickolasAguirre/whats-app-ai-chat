# Rag-API: tenant desde el JWT (`tenantCode`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rag-API toma el tenant únicamente del claim `tenantCode` del JWT ya verificado (de usuario o de servicio); el header `X-Tenant-Id` desaparece y `tenantId` pasa a llamarse `tenantCode` en todo el servicio.

**Architecture:** `JwtAuth.validate` devuelve un *principal* `{ sub, tenantCode, isService }` y rechaza el token si el claim falta o es inválido; `@nestjs/authentication` lo deja en `request.user` y un decorador `@TenantCode()` lo entrega a los controllers. El renombre `tenantId` → `tenantCode` recorre dominio, servicios, repositorio, schema y una migración nueva.

**Tech Stack:** NestJS 12 (ESM, imports con `.js`), `@nestjs/authentication ^0.1.5`, TypeORM + PostgreSQL, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-13-auth-servicio-tenant-code-design.md` (§4.1, §4.2, §6). Repo de trabajo: `what-app/Rag-API`. Este plan se aplica **antes** que `2026-11-13-bot-identidad-servicio.md`.

## Global Constraints

- Claim `tenantCode` (string) con formato `^[a-z0-9][a-z0-9_-]{0,62}$`; los tokens de servicio además llevan `typ: 'service'`. Un token sin `tenantCode` válido → 401. No se acepta ningún otro origen del tenant: el header `X-Tenant-Id` se elimina (sin período de transición).
- `JwtAuth` conserva `issuer: 'container-api'`, `audience: 'rag-api'`, `realm: 'rag-api'` y la clave `JWT_PUBLIC_KEY`: **no se tocan**.
- El principal es `{ sub: string; tenantCode: string; isService: boolean }` (`isService = claims.typ === 'service'`).
- `Collection.tenantId` → `tenantCode` (columna, entidad, puerto, repositorio, servicios); el único pasa a `UQ_Collection_tenantCode_name` sobre `("tenantCode","name")`. La migración `1731000000000-add-tenant-to-collection.ts` **no se edita**: se agrega una nueva, porque alguna base pudo aplicarla.
- Colección por defecto `qwen` por tenant: sin cambios.
- Reglas del usuario: **desarrollo primero, tests al final** (Task 5); **nunca ejecutar tests que dependan de Docker** (`pnpm test:int`, `pnpm test:e2e`): se actualizan pero no se corren; **no levantar contenedores**; no hacer commit hasta que el usuario lo pida y sin `Co-Authored-By`.
- El árbol de trabajo tiene cambios sin commitear del usuario (reestructura a `core/application`, `infrastructure/modules`): leer el estado vigente de cada archivo antes de editarlo y no revertir nada ajeno.
- Imports relativos con `.js`; 4 espacios en `src/`, 2 en los specs.

## Review Focus

- Un token válido del tenant A con header `X-Tenant-Id: b` sigue viendo solo datos de A (el header se ignora).
- Token sin `tenantCode`, con mayúsculas, con espacios o de 64 caracteres → 401, y no llega a ningún service.
- Token de servicio (`typ: 'service'`) y token de usuario funcionan igual sobre los mismos endpoints.
- `@TenantCode()` sin principal (ruta mal configurada como pública) → error explícito, nunca `undefined` hacia los services.
- La migración de renombrado conserva las filas y el único, y su `down` las devuelve a `tenantId`.

## File Structure

- Create `src/infrastructure/extern/auth/principal.ts`, `src/controller/decorators/tenant-code.decorator.ts`, `src/infrastructure/persistence/migrations/1731000000001-rename-tenant-id-to-tenant-code.ts`, `test/helpers/tokens.ts`.
- Modify: `src/core/domain/tenant.ts`, `src/infrastructure/extern/auth/jwt-auth/jwt-auth.ts`, los 4 controllers, `collection-resolver.service.ts`, `collection.service.ts`, `document.service.ts`, `item.service.ts`, `collection.entity.ts`, `collection.port.ts`, `collection.repository.ts`, `collection.schema.ts`, `database.options.ts`, specs, `test/helpers/fixtures.ts`, `test/env.ts`, `test/rag-api.e2e-spec.ts`, `README.md`, `.env.example`, `CLAUDE_CONTEXT.md`, `../CLAUDE.md`.
- Delete: `src/controller/decorators/tenant-id.decorator.ts` y su spec.

---

### Task 1: Principal, validación del claim y decorador

**Files:**
- Create: `src/infrastructure/extern/auth/principal.ts`, `src/controller/decorators/tenant-code.decorator.ts`
- Modify: `src/core/domain/tenant.ts`, `src/infrastructure/extern/auth/jwt-auth/jwt-auth.ts`
- Delete: `src/controller/decorators/tenant-id.decorator.ts`

**Interfaces:**
- Produces: `TENANT_CODE_PATTERN` en `core/domain/tenant.ts` (reemplaza a `TENANT_ID_PATTERN`; mismo regex); `export interface Principal { sub: string; tenantCode: string; isService: boolean }` en `principal.ts`; `JwtAuth.validate(claims: JwtClaims): Principal | null`; `TenantCode: () => ParameterDecorator` (devuelve `string`).

- [ ] **Step 1:** Renombrar la constante a `TENANT_CODE_PATTERN` y actualizar el comentario; mantener `DEFAULT_COLLECTION_NAME`.
- [ ] **Step 2:** `principal.ts` con la interfaz; si `@nestjs/authentication` exige aumentar `AuthenticationTypes` para tipar `request.user`, hacerlo aquí (el implementador revisa los typings de la librería).
- [ ] **Step 3:** `JwtAuth.validate`: devolver `null` si `sub` no es string no vacío o `tenantCode` no cumple `TENANT_CODE_PATTERN`; si no, `{ sub, tenantCode, isService: claims.typ === 'service' }`. No tocar el constructor.
- [ ] **Step 4:** `TenantCode` con `createParamDecorator`: lee `request.user` (el principal), devuelve `tenantCode`; si no hay principal lanza `UnauthorizedException('Token sin tenant')`. Borrar `tenant-id.decorator.ts`.
- [ ] **Step 5:** Verificar. Run: `pnpm build` — Expected: errores solo en los archivos que aún importan `TenantId`/`TENANT_ID_PATTERN` (Tasks 2–3).

### Task 2: `tenantId` → `tenantCode` en dominio, servicios y persistencia

**Files:**
- Create: `src/infrastructure/persistence/migrations/1731000000001-rename-tenant-id-to-tenant-code.ts`
- Modify: `collection.entity.ts`, `collection.port.ts`, `collection.repository.ts`, `collection.schema.ts`, `collection-resolver.service.ts`, `collection.service.ts`, `document.service.ts`, `item.service.ts`, `database.options.ts`

**Interfaces:**
- Produces: `Collection.tenantCode: string`; `NewCollection.tenantCode`; `CollectionRepositoryPort.list(tenantCode)`, `findByName(tenantCode, name)`; los services reciben `tenantCode: string` como primer parámetro (mismos nombres de método de hoy); migración `RenameTenantIdToTenantCode1731000000001`.

- [ ] **Step 1:** Renombrar el campo y los parámetros `tenantId` → `tenantCode` en todos los archivos listados (solo nombres; la lógica no cambia). `CollectionSchema`: columna `tenantCode` y único `UQ_Collection_tenantCode_name`.
- [ ] **Step 2:** Migración: `up` renombra la columna (`ALTER TABLE "Collection" RENAME COLUMN "tenantId" TO "tenantCode"`) y el constraint `UQ_Collection_tenantId_name` → `UQ_Collection_tenantCode_name`, cada paso protegido para que no falle si ya está hecho (consulta a `information_schema`/`pg_constraint`); `down` revierte ambos. Registrarla en `buildDatabaseOptions` (`migrations`) detrás de `AddTenantToCollection1731000000000`.
- [ ] **Step 3:** Verificar. Run: `pnpm build` — Expected: errores solo en controllers (Task 3) y specs.

### Task 3: Controllers sin header

**Files:** Modify `collections.controller.ts`, `items.controller.ts`, `search.controller.ts`, `documents.controller.ts`

- [ ] **Step 1:** Sustituir `@TenantId() tenantId` por `@TenantCode() tenantCode` en cada handler y pasarlo igual que hoy a los services; quitar `@ApiHeader({ name: 'X-Tenant-Id', ... })` y su import; dejar `@ApiBearerAuth()`.
- [ ] **Step 2:** Verificar. Run: `pnpm build` y `pnpm lint` — Expected: sin errores nuevos; `grep -rn "TenantId\|X-Tenant-Id\|x-tenant-id" src` solo debe aparecer en specs y en la migración antigua.

### Task 4: Configuración y documentación

**Files:** Modify `test/env.ts` (quitar `RAG_API_KEY`, añadir `JWT_PUBLIC_KEY` de prueba si el helper de la Task 5 lo requiere), `README.md`, `.env.example` (comentar que el tenant llega por el claim `tenantCode`), `CLAUDE_CONTEXT.md`, `../CLAUDE.md` (contrato: sin `X-Tenant-Id`; el tenant sale del claim `tenantCode`).

- [ ] **Step 1:** Actualizar esos archivos; en `CLAUDE_CONTEXT.md` documentar principal, claim, `Collection.tenantCode` y la migración de renombrado.

### Task 5: Tests y verificación final

**Files:**
- Create: `test/helpers/tokens.ts`, `src/infrastructure/extern/auth/jwt-auth/jwt-auth.spec.ts`, `src/controller/decorators/tenant-code.decorator.spec.ts`
- Modify: `collection-resolver.service.spec.ts`, `collection.service.spec.ts`, `item.service.spec.ts`, `document.service.spec.ts`, specs de los 4 controllers, `collection.repository.int-spec.ts`, `test/helpers/fixtures.ts`, `test/rag-api.e2e-spec.ts`
- Delete: `src/controller/decorators/tenant-id.decorator.spec.ts`

**Interfaces:**
- Produces: `generateTestKeyPair(): { publicKey: string; privateKey: string }` y `signTestToken(privateKey: string, claims: Record<string, unknown>): string` (JWT RS256 con `iss: 'container-api'`, `aud: 'rag-api'`, `exp` en 1 h por defecto) en `test/helpers/tokens.ts`, solo con `node:crypto`.

- [ ] **Step 1: `jwt-auth.spec.ts`** (unitario, llama a `validate` directo): válido → `{ sub: 'u1', tenantCode: 'acme-1', isService: false }`; con `typ: 'service'` → `isService: true`; devuelve `null` para: sin `tenantCode`, `'Acme'`, `'con espacio'`, `'a'.repeat(64)`, `''`, y sin `sub`.
- [ ] **Step 2: `tenant-code.decorator.spec.ts`:** devuelve `tenantCode` del principal en `request.user`; sin principal lanza `UnauthorizedException`.
- [ ] **Step 3:** Actualizar los specs existentes de services, resolver y controllers al nuevo nombre/firma (`tenantCode` primero; el controller recibe el código ya resuelto).
- [ ] **Step 4: `collection.repository.int-spec.ts` y `test/rag-api.e2e-spec.ts` (se actualizan, NO se ejecutan):** las peticiones llevan `Authorization: Bearer <signTestToken(...)>` con `tenantCode` en el claim (el e2e levanta la app con `JWT_PUBLIC_KEY` del par de prueba); casos nuevos: header `X-Tenant-Id` distinto del claim se ignora (se ven solo los datos del claim); token sin `tenantCode` → 401; token con `typ: 'service'` funciona igual; los casos de aislamiento entre tenants existentes usan dos tokens. Un test de la migración de renombrado (columna y único renombrados, datos conservados, `down` los devuelve).
- [ ] **Step 5: Ejecutar solo lo permitido.** Run: `pnpm lint && pnpm build && pnpm test` — Expected: todo en verde. NO ejecutar `pnpm test:int` ni `pnpm test:e2e`.
- [ ] **Step 6: Commit** (solo si el usuario lo pide): `git add -A && git commit -m "feat: tenant from JWT tenantCode claim"`.
