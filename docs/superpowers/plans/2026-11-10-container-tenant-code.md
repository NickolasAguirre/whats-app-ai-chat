# container: identificador único de tenant y su guardado en el frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Tenant` en container.API tiene un `code` único que `GET /tenant` devuelve; container.WEB lo guarda en `localStorage` al cargar el tenant, para que el panel lo envíe al bot como `X-Tenant-Id`.

**Architecture:** Se añade la columna `code` (texto) al modelo `Tenant` del contrato Prisma, a la entidad y al DTO público. En container.WEB, `TenantService.load()` guarda el código y expone una señal `code`; un pequeño servicio de almacenamiento lo lee/escribe con `try/catch`.

**Tech Stack:** container.API: NestJS 12, Prisma 8 contract-first, Vitest. container.WEB: Angular 22, `ng test`.

**Spec:** `docs/superpowers/specs/2026-11-10-rag-multitenant-e-historial-design.md` (D1; flujo del tenant aclarado el 2026-11-10). Repos: `Container/container.API` y `Container/container.WEB`.

## Global Constraints

- `code` cumple `^[a-z0-9][a-z0-9_-]{0,62}$` (mismo patrón que Rag-API y el bot) y vale `'default'` para el registro sembrado (debe coincidir con `TENANT_ID` del bot).
- Sigue existiendo un único registro por instalación (`Tenant.ID = 1`); `code` es único dentro de la tabla y no editable desde el panel en esta iteración.
- `GET /tenant` sigue siendo público; ahora incluye `code` (no es un secreto: viaja en un header sin seguridad por ahora).
- Clave de `localStorage`: `container.tenantCode`. Todo acceso envuelto en `try/catch`; la app funciona sin storage.
- Fuera de alcance: que `whatsapp-chat-bot-WEB` (hoy sobre datos mock) envíe el header; se hace cuando exista la conexión con `/admin/*` del bot.
- Regla del usuario: **desarrollo primero, tests al final** (Task 3). Antes solo compilar (`pnpm build` / `ng build`).
- Después de editar `contract.ts`: `pnpm prisma contract emit`; hay que **planificar y aplicar la migración** (ver `prisma-8.md` en la raíz de container.API).
- No hacer commit hasta que el usuario lo pida; sin `Co-Authored-By`.

## Review Focus

- La instalación ya existente (fila `id = 1` sin `code`) sigue funcionando tras la migración y devuelve `code: 'default'`.
- `GET /tenant` de una fila con `code` mal escrito (`Acme S.A.`) devuelve el valor de fábrica `'default'`, no rompe el login.
- container.WEB sin `localStorage` (modo privado, bloqueado) carga igual y no lanza.
- Si `GET /tenant` falla, container.WEB conserva el último `code` guardado en vez de borrarlo.

---

### Task 1: container.API — campo `code`

**Files:**
- Modify: `Container/container.API/src/infrastructure/persistence/prisma/contract.ts` (modelo `Tenant`), `src/core/domain/entities/tenant.entity.ts`, `src/core/application/dto/tenant/TenantDto.ts`, `src/core/application/services/tenant.service.ts`, `src/seed.ts` (solo si el seed construye el tenant por su cuenta)
- Generated: `contract.json`, `contract.d.ts` (vía `contract emit`) y la migración

**Interfaces:**
- Produces: `Tenant.code: string`; `TenantDto.code: string` (`@Expose()`); `TENANT_DEFAULTS.code = 'default'`; `const TENANT_CODE = /^[a-z0-9][a-z0-9_-]{0,62}$/` en `tenant.service.ts`.

- [ ] **Step 1: Leer `prisma-8.md`** para ver cómo declarar un campo con valor por defecto y cómo planificar/aplicar la migración en este proyecto; si un default no es soportable en el contrato, declarar `code` requerido y rellenar la fila existente en la migración con `'default'`.
- [ ] **Step 2: Contrato.** Añadir `code: field.text()` al modelo `Tenant` (con default `'default'` si Step 1 lo permite) y una restricción de unicidad si el builder la soporta; ejecutar `pnpm prisma contract emit`.
- [ ] **Step 3: Entidad, DTO y servicio.** `Tenant.code`; `TenantDto.code`; en `get()` devolver `code` validado con `TENANT_CODE` (si no cumple, `TENANT_DEFAULTS.code`); `ensureDefault` incluye `code` por `TENANT_DEFAULTS`.
- [ ] **Step 4: Migración.** Planificar y aplicar según `prisma-8.md`; comprobar que la fila `id = 1` queda con `code = 'default'`.
- [ ] **Step 5: Verificar.** Run: `pnpm build` — Expected: sin errores.

### Task 2: container.WEB — guardar el tenant en `localStorage`

**Files:**
- Modify: `Container/container.WEB/src/app/core/domain/models/tenant.models.ts`, `src/app/core/services/tenant/tenant.service.ts`
- Create: `Container/container.WEB/src/app/core/services/tenant/tenant-storage.ts`

**Interfaces:**
- Produces: `Tenant.code: string` y `DEFAULT_TENANT.code = 'default'`; en `tenant-storage.ts`: `readTenantCode(): string | null` y `saveTenantCode(code: string): void` (clave `container.tenantCode`, ambos con `try/catch`); en `TenantService`: `readonly code: Signal<string>` (valor cargado, o el guardado si la API falla, o `DEFAULT_TENANT.code`).

- [ ] **Step 1: Modelo.** Añadir `code: string` a `Tenant` y `code: 'default'` a `DEFAULT_TENANT`.
- [ ] **Step 2: `tenant-storage.ts`** con las dos funciones; seguir el estilo de acceso a `localStorage` de `session.service.ts`.
- [ ] **Step 3: `TenantService.load()`.** En éxito: validar `loaded.code` con el patrón `^[a-z0-9][a-z0-9_-]{0,62}$` (si no cumple, usar el guardado o el default), asignarlo al estado y llamar `saveTenantCode`. En fallo: usar `readTenantCode() ?? DEFAULT_TENANT.code` sin sobrescribir lo guardado. Exponer `code = computed(() => this.current().code)`.
- [ ] **Step 4: Verificar.** Run: `ng build` (en `container.WEB`) — Expected: sin errores.

### Task 3: Tests, documentación y verificación

**Files:**
- Modify: `Container/container.API/src/core/application/services/tenant.service.spec.ts`, `Container/container.WEB/src/app/core/services/tenant/tenant.service.spec.ts`, `Container/container.API/CLAUDE_CONTEXT.md`, `Container/container.WEB/CLAUDE_CONTEXT.md`
- Create: `Container/container.WEB/src/app/core/services/tenant/tenant-storage.spec.ts`

- [ ] **Step 1: `tenant.service.spec.ts` (API).** El helper `tenant()` incluye `code: 'acme'`; `get()` lo devuelve en el resultado (actualizar el `toEqual` existente); `code: 'Acme S.A.'` se sustituye por `'default'`; `ensureDefault` crea con `code: 'default'`.
- [ ] **Step 2: `tenant-storage.spec.ts` (WEB).** `saveTenantCode('acme')` luego `readTenantCode()` devuelve `'acme'`; con `localStorage` lanzando (spy en `Storage.prototype.setItem`/`getItem`) no propagan error y `readTenantCode()` devuelve `null`.
- [ ] **Step 3: `tenant.service.spec.ts` (WEB).** Añadir `code: 'acme'` a `BRAND`; tras `load()` `service.code()` es `'acme'` y `localStorage['container.tenantCode']` es `'acme'`; si la API falla con `'acme'` ya guardado, `service.code()` sigue en `'acme'`; si la API devuelve `code: 'ACME'`, no se guarda y se usa el default.
- [ ] **Step 4: Documentar.** Anotar en ambos `CLAUDE_CONTEXT.md` el campo `code`, el endpoint y la clave de `localStorage`; en el de container.API añadir que el bot usa ese valor como tenant (hoy una constante).
- [ ] **Step 5: Ejecutar.** Run: `pnpm lint && pnpm test` (container.API) y `ng test` (container.WEB) — Expected: todo en verde (los 8 specs que ya fallaban antes en container.API se mantienen igual y no cuentan).
- [ ] **Step 6: Commit** (solo si el usuario lo pide) por repo: `git add -A && git commit -m "feat: tenant code exposed and stored in the frontend"`.
