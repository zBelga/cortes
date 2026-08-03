import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Injeta o usuário resolvido pelo SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    if (!request.user) throw new Error('CurrentUser usado em rota sem AuthGuard');
    return request.user;
  },
);
