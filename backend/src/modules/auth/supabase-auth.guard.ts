import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { UnauthorizedError } from '../../common/errors/domain-error';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';
import { UserResolverService } from './user-resolver.service';
import { SingleUserService } from './single-user.service';

/**
 * Guard de autenticação. O modo é decidido por ambiente:
 *  · `single-user` — instalação pessoal, sem login; tudo é do dono
 *  · `supabase`    — multiusuário, JWT verificado por JWKS
 *
 * A resolução do usuário é idêntica nos dois casos: o resto da aplicação
 * nunca sabe qual modo está ativo.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseJwtVerifier,
    private readonly users: UserResolverService,
    private readonly singleUser: SingleUserService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();

    if (this.env.AUTH_MODE === 'single-user') {
      request.user = await this.singleUser.resolve();
      return true;
    }

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de autenticação ausente');
    }

    const claims = await this.verifier.verify(header.slice(7));
    request.user = await this.users.resolve(claims);
    return true;
  }
}
