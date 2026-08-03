import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { SupabaseClaims } from './supabase-jwt.verifier';

const CACHE_TTL_SECONDS = 300;

/**
 * Traduz claims do Supabase em usuário local, criando-o no primeiro acesso
 * (just-in-time provisioning). Cacheado: sem isto, toda request faria um SELECT.
 */
@Injectable()
export class UserResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async resolve(claims: SupabaseClaims): Promise<AuthenticatedUser> {
    return this.redis.remember(`user:auth:${claims.sub}`, CACHE_TTL_SECONDS, async () => {
      const user = await this.prisma.user.upsert({
        where: { authId: claims.sub },
        update: { lastSeenAt: new Date() },
        create: {
          authId: claims.sub,
          email: claims.email ?? `${claims.sub}@unknown.local`,
          name: claims.user_metadata?.name ?? null,
          avatarUrl: claims.user_metadata?.avatar_url ?? null,
          lastSeenAt: new Date(),
          // Crédito de boas-vindas concedido no mesmo commit da criação da conta.
          ledger: { create: { kind: 'GRANT', amount: 30, description: 'Créditos de boas-vindas' } },
        },
        select: { id: true, authId: true, email: true, role: true, plan: true },
      });
      return user;
    });
  }

  async invalidate(authId: string): Promise<void> {
    await this.redis.invalidate(`user:auth:${authId}`);
  }
}
