import {
    BadRequestException,
    Controller,
    Get,
    Inject,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { MessagesQueryDto } from './dto/messages-query.dto.js';
import { PeopleQueryDto } from './dto/people-query.dto.js';
import {
    ConversationPerson,
    ConversationsQueryPort,
    MessageCursor,
    StoredConversationMessage,
} from '../core/domain/ports/conversations-query-port/conversations-query.port.js';

const DEFAULT_PAGE_SIZE = 30;

// El ValidationPipe va solo en los endpoints de administración: el DTO del webhook de YCloud no tiene decoradores.
@ApiTags('admin')
@UseGuards(TenantMatchGuard)
@Controller('admin/people')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminPeopleController {
    constructor(@Inject(ConversationsQueryPort) private readonly conversations: ConversationsQueryPort) {}

    @Get()
    async list(@Query() query: PeopleQueryDto) {
        const from = query.from ? new Date(query.from) : undefined;
        const to = query.to ? new Date(query.to) : undefined;
        if (from && to && from >= to) {
            throw new BadRequestException('"from" debe ser anterior a "to".');
        }

        return (await this.conversations.listPeople(query.search, { from, to })).map(toPersonDto);
    }

    @Get(':id')
    async get(@Param('id', ParseUUIDPipe) id: string) {
        return toPersonDto(await this.findPerson(id));
    }

    @Get(':id/messages')
    async messages(@Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQueryDto) {
        await this.findPerson(id);

        const from = query.from ? new Date(query.from) : undefined;
        const to = query.to ? new Date(query.to) : undefined;
        if (from && to && from >= to) {
            throw new BadRequestException('"from" debe ser anterior a "to".');
        }

        const page = await this.conversations.listMessages(id, {
            from,
            to,
            before: query.before ? decodeCursor(query.before) : undefined,
            limit: query.limit ?? DEFAULT_PAGE_SIZE,
        });

        const last = page.items.at(-1);
        // `nextCursor` apunta al mensaje más antiguo de la página; `hasMore` dice si quedan más dentro del rango pedido.
        return {
            items: page.items.map(toMessageDto),
            nextCursor: last ? encodeCursor({ createdAt: last.timestamp, id: last.id }) : null,
            hasMore: page.hasMore,
        };
    }

    private async findPerson(id: string): Promise<ConversationPerson> {
        const person = await this.conversations.getPerson(id);
        if (!person) {
            throw new NotFoundException('Persona no encontrada.');
        }
        return person;
    }
}

function toPersonDto(person: ConversationPerson) {
    return {
        id: person.id,
        phoneNumber: person.phoneNumber,
        name: person.name ?? undefined,
        lastMessageAt: person.lastMessageAt.toISOString(),
        lastMessagePreview: person.lastMessagePreview,
    };
}

// El panel habla de "user" y "assistant"; el historial guarda "inbound" y "outbound".
function toMessageDto(message: StoredConversationMessage) {
    return {
        id: message.id,
        personId: message.personId,
        role: message.role === 'inbound' ? 'user' : 'assistant',
        text: message.text,
        timestamp: message.timestamp.toISOString(),
    };
}

function encodeCursor(cursor: MessageCursor): string {
    return Buffer.from(JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64url');
}

function decodeCursor(value: string): MessageCursor {
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { t?: string; id?: string };
        const createdAt = new Date(parsed.t ?? '');
        if (!parsed.id || !isUUID(parsed.id) || Number.isNaN(createdAt.getTime())) {
            throw new Error('invalid');
        }
        return { createdAt, id: parsed.id };
    } catch {
        throw new BadRequestException('El cursor no es válido.');
    }
}
