import { Inject, Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { UnauthorizedError } from '../../common/errors/domain-error';

export interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  user_metadata?: { name?: string; avatar_url?: string };
}

/**
 * Verificação local via JWKS remoto com cache.
 * Chamar a API do Supabase a cada request adicionaria ~80ms e um ponto de falha.
 */
@Injectable()
export class SupabaseJwtVerifier {
  private readonly logger = new Logger(SupabaseJwtVerifier.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Inicialização preguiçosa: no modo single-user não existe URL do Supabase,
   * e construir o JWKS no constructor derrubaria o boot da aplicação.
   */
  private keySet() {
    this.jwks ??= createRemoteJWKSet(
      new URL(`${this.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
      { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 },
    );
    return this.jwks;
  }

  async verify(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keySet(), {
        issuer: this.env.SUPABASE_JWT_ISSUER,
        audience: 'authenticated',
        clockTolerance: 5,
      });
      return payload as SupabaseClaims;
    } catch (error) {
      this.logger.debug(`JWT rejeitado: ${(error as Error).message}`);
      throw new UnauthorizedError('Sessão inválida ou expirada');
    }
  }
}
