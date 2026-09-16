# Diseño: Arquitectura multi-tenant

**Fecha:** 2026-09-14
**Estado:** Aprobado para pasar a plan de implementación

## Resumen

El sistema hoy es de un solo tenant: un número de WhatsApp, un adapter de IA por vez, sin persistencia. Este diseño introduce multi-tenancy — múltiples clientes (tenants), cada uno con su(s) propio(s) número(s) de WhatsApp, credenciales propias, instrucciones propias para la IA, y memoria conversacional de corto plazo por persona. Es la primera vez que el proyecto incorpora una base de datos.

## Objetivos

- Resolver a qué tenant pertenece un mensaje entrante a partir del número de WhatsApp que lo recibió.
- Cada tenant tiene sus propias credenciales de YCloud (API key, webhook secret) — no compartidas.
- Cada tenant tiene sus propias instrucciones (system prompt) para la IA.
- Memoria conversacional de corto plazo (horas) por persona, usada como contexto para la IA.
- Mantener la regla de dependencia de Clean Architecture ya establecida en el proyecto: `core` nunca conoce Prisma, Redis, ni Azure Key Vault — solo puertos.

## No-objetivos (fuera de alcance de este diseño)

- **Facturación/pagos**: no se diseña aquí. Este diseño solo deja la relación Tenant↔WhatsAppNumber lista para que la atribución de uso por cliente sea posible más adelante, como diseño aparte.
- **CRUD de administración de tenants** (alta/baja/edición vía panel admin, onboarding de un tenant nuevo): no está definido cómo se crean los registros de Tenant/WhatsAppNumber/Instructions todavía — se asume que existen, no se diseña cómo se cargan.
- **Integración real de Azure Key Vault**: se diseña el puerto (`SecretsPort`) y se deja listo para un adapter real; la implementación con Azure queda para más adelante, dijo el usuario explícitamente.
- **Mensajes de grupo de WhatsApp** (`groupId`): sigue siendo un pendiente ya documentado en `docs/flow.md`, no se resuelve en este diseño.
- **Versionado de `Instructions`**: se asume una sola instrucción activa por tenant (relación 1:1), no un historial de versiones.

## Entidades de dominio (`core/domain/entities/`)

```ts
export class Tenant {
    id: string;
    name: string;
    active: boolean;
    createdAt: Date;
}

export class WhatsAppNumber {          // uno-a-muchos con Tenant
    id: string;
    tenantId: string;
    phoneNumber: string;               // el "to" — número de negocio del tenant
    wabaId: string;
    ycloudApiKeySecretRef: string;     // referencia al secreto (Vault/stub), nunca el valor
    webhookSecretRef: string;          // idem
    active: boolean;
}

export class Person {                  // tenant-scoped
    id: string;                        // el mismo teléfono puede ser una Person
    tenantId: string;                  // distinta por cada tenant al que le escribe
    phoneNumber: string;               // el "from" — quien escribe
    name?: string;                     // de customerProfile.name si viene en el webhook
    createdAt: Date;
}

export class Instructions {            // 1:1 con Tenant
    id: string;
    tenantId: string;
    content: string;                   // el system prompt para la IA
    updatedAt: Date;
}

export class ConversationMessage {     // memoria efímera, vive en Redis con TTL de horas
    role: "inbound" | "outbound";
    text: string;
    timestamp: Date;
}
```

## Puertos nuevos (`core/domain/ports/`)

```ts
export abstract class WhatsAppNumberRepositoryPort {
    abstract findByExternalId(wabaIdOrPhone: string): Promise<WhatsAppNumber | null>;
}

export abstract class PersonRepositoryPort {
    abstract findOrCreate(tenantId: string, phoneNumber: string, name?: string): Promise<Person>;
}

export abstract class InstructionsRepositoryPort {
    abstract getForTenant(tenantId: string): Promise<Instructions | null>;
}

export abstract class MessageMemoryPort {
    abstract getRecentMessages(tenantId: string, personId: string): Promise<ConversationMessage[]>;
    abstract appendMessage(tenantId: string, personId: string, message: ConversationMessage): Promise<void>;
}

export abstract class SecretsPort {
    abstract getSecret(ref: string): Promise<string>;
}
```

Solo se diseñan los puertos que el flujo de mensajes necesita en runtime (resolver tenant, persona, instrucciones, historial). No se incluye CRUD de administración — ver No-objetivos.

### Cambio a `AiPort` existente

`generateMessage` pasa de aceptar solo el texto a aceptar también instrucciones e historial:

```ts
// antes
abstract generateMessage(message: string): Promise<string>;

// después
abstract generateMessage(message: string, options: { instructions?: string; history?: ConversationMessage[] }): Promise<string>;
```

Esto es un cambio de interfaz que afecta a `AiService` (el selector) y también a `AiSelectedPort` (`infrastructure/extern/ai/ports/ai-selected.port.ts`) — `GeminiService` y `QwenService` implementan `AiSelectedPort`, no `AiPort` directamente, así que ese puerto interno necesita la misma firma nueva para que `AiService` pueda reenviar `instructions`/`history` a quien elija.

## Cambios al flujo (respecto a `docs/flow.md`)

1. **`YCloudWebhookSignatureGuard`**: en vez de validar contra un secreto global de `.env`, ahora:
   - Lee `wabaId`/`to` del body (sin validar todavía — solo para identificar el tenant).
   - `WhatsAppNumberRepositoryPort.findByExternalId(wabaId)` → si no existe, 401 genérico (mismo error que firma inválida, para no revelar si el número existe).
   - `SecretsPort.getSecret(whatsAppNumber.webhookSecretRef)` → obtiene el secreto real.
   - Valida la firma HMAC contra ese secreto (igual que hoy, mismo algoritmo).
   - Si es válida, adjunta el `WhatsAppNumber` resuelto a la request (para que el controller no vuelva a buscarlo).
2. **`WhatsappMessagesControllerController`**: sin cambios grandes — sigue parseando `YCloudInboundMessageEvent`, ahora también lee el `WhatsAppNumber`/tenant que dejó el guard en la request.
3. **`WhatsappMessagesControllerService.handleIncomingMessage`** (use-case), nuevo orden:
   - `PersonRepositoryPort.findOrCreate(tenantId, from, name?)`
   - `InstructionsRepositoryPort.getForTenant(tenantId)`
   - `MessageMemoryPort.getRecentMessages(tenantId, person.id)`
   - `AiPort.generateMessage(text, { instructions, history })`
   - `MessageMemoryPort.appendMessage(...)` para el mensaje entrante y la respuesta
   - `WhatsAppPort.sendMessage(reply)` — firma sin cambios
4. **`WhatsAppService`** (adapter): deja de leer `Y_CLOUD_URL`/`API_KEY_YCLOUD` de variables de entorno globales. Al mandar la respuesta, resuelve el `WhatsAppNumber` por el `from` del mensaje saliente (`WhatsAppNumberRepositoryPort`) y pide la API key vía `SecretsPort`. `WhatsAppPort.sendMessage(message)` no cambia de firma — el multi-tenant queda encapsulado en el adapter.

## Tecnología de persistencia

- **Datos relacionales** (`Tenant`, `WhatsAppNumber`, `Person`, `Instructions`): **Prisma** + PostgreSQL. Se eligió Prisma sobre TypeORM porque genera un cliente separado de las entidades de dominio — las clases en `core/domain/entities` quedan sin decoradores de persistencia, y el mapeo Prisma-model ↔ entidad de dominio vive contenido en el repositorio/adapter dentro de `infrastructure`, preservando la regla de dependencia ya establecida en el proyecto.
- **Memoria conversacional** (`ConversationMessage`): **Redis**, con TTL de horas (valor exacto a definir en el plan de implementación), detrás de `MessageMemoryPort`. Elegido por su soporte nativo de expiración — evita tener que armar un job de limpieza manual.
- **Secretos** (`SecretsPort`): adapter real con **Azure Key Vault**, a configurar más adelante. Mientras tanto, un adapter simple/stub (a definir en el plan: variable de entorno o tabla en texto plano marcada explícitamente como temporal) para no bloquear el resto del desarrollo.

## Manejo de errores

- **Número de WhatsApp desconocido**: el guard rechaza con 401 genérico — mismo mensaje que una firma inválida, para no revelar si el número está o no registrado.
- **Redis caído**: degradación suave. Si falla `getRecentMessages`, se loguea el error y se continúa sin historial (mejor responder sin memoria que no responder). Si falla `appendMessage`, se loguea pero no se aborta la respuesta ya generada y enviada.
- **`SecretsPort` caído**: esto sí aborta la request — sin secreto no se puede validar la firma del webhook ni autenticar el envío a YCloud.

## Testing

Misma convención ya establecida en el proyecto (`docs/conventions.md`): los specs de servicios que dependen de un puerto mockean el puerto (`{ provide: PersonRepositoryPort, useValue: { findOrCreate: vi.fn() } }`), nunca las clases concretas de Prisma/Redis/Key Vault. Los specs de los adapters concretos (repositorios de Prisma, el adapter de Redis) mockean sus propias dependencias externas (el cliente de Prisma, el cliente de Redis), nunca el puerto que implementan.

## Abiertos para el plan de implementación (detalles, no decisiones de arquitectura)

- TTL exacto de Redis (horas).
- Forma concreta del adapter stub de `SecretsPort` mientras no está Azure Key Vault.
- Estructura exacta de las claves de Redis (una key por conversación con una lista, vs. una key por mensaje).
