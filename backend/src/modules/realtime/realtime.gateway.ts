import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { SupabaseJwtVerifier } from '../auth/supabase-jwt.verifier';
import { UserResolverService } from '../auth/user-resolver.service';
import { SingleUserService } from '../auth/single-user.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { projectRoom, type PipelineEvent } from './pipeline-events';

const subscribeSchema = z.object({ projectId: z.string().cuid() });

/**
 * O WebSocket **antecipa** a UI; a fonte da verdade é `GET /projects/:id/pipeline`.
 * Se a conexão cair, o cliente reconcilia por HTTP e nada se perde.
 */
@WebSocketGateway({
  namespace: '/pipeline',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly verifier: SupabaseJwtVerifier,
    private readonly users: UserResolverService,
    private readonly singleUser: SingleUserService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Uma única assinatura por réplica com padrão glob, em vez de uma
   * assinatura por projeto: o custo no Redis fica O(1) por instância.
   */
  async onModuleInit(): Promise<void> {
    await this.redis.subscriber.psubscribe('pipeline:*');
    this.redis.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const event = JSON.parse(message) as PipelineEvent;
        this.server.to(projectRoom(event.projectId)).emit(event.type, event);
      } catch (error) {
        this.logger.warn(`Evento inválido em ${channel}: ${(error as Error).message}`);
      }
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    // Instalação pessoal: não há de quem separar as sockets.
    if (this.env.AUTH_MODE === 'single-user') {
      socket.data.userId = (await this.singleUser.resolve()).id;
      return;
    }

    // Autenticar no handshake: uma socket anônima nunca deve existir.
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return void socket.disconnect(true);

    try {
      const claims = await this.verifier.verify(token);
      const user = await this.users.resolve(claims);
      socket.data.userId = user.id;
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: boolean }> {
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) return { ok: false };

    // Autorização por room: sem esta checagem, qualquer um ouviria qualquer projeto.
    const owned = await this.prisma.project.count({
      where: { id: parsed.data.projectId, userId: socket.data.userId as string, deletedAt: null },
    });
    if (!owned) return { ok: false };

    await socket.join(projectRoom(parsed.data.projectId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const parsed = subscribeSchema.safeParse(body);
    if (parsed.success) await socket.leave(projectRoom(parsed.data.projectId));
    return { ok: true };
  }
}
