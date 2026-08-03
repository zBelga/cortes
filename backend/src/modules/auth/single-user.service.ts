import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Identidade fixa do modo single-user. Igual à do seed, para os dados baterem. */
export const SINGLE_USER_AUTH_ID = 'single-user';

/**
 * Modo de um usuário só.
 *
 * Instalações pessoais não têm de quem se defender: exigir login seria
 * atrito puro. O dono é criado no boot e toda requisição é atribuída a ele.
 *
 * O usuário é resolvido **uma vez** e mantido em memória — no caminho quente
 * de cada request não há nem consulta ao banco nem ida ao Redis.
 */
@Injectable()
export class SingleUserService implements OnModuleInit {
  private readonly logger = new Logger(SingleUserService.name);
  private owner: AuthenticatedUser | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.AUTH_MODE !== 'single-user') return;
    await this.ensureOwner();
  }

  /** Sempre disponível após o boot; recria sob demanda se o banco for resetado. */
  async resolve(): Promise<AuthenticatedUser> {
    return this.owner ?? this.ensureOwner();
  }

  private async ensureOwner(): Promise<AuthenticatedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { authId: SINGLE_USER_AUTH_ID },
      select: { id: true, authId: true, email: true, role: true, plan: true },
    });

    if (existing) {
      this.owner = existing;
      return existing;
    }

    // Primeira execução: cria o dono já com papel de ADMIN (o painel admin é
    // dele) e um saldo de créditos generoso, já que não há cobrança envolvida.
    const created = await this.prisma.user.create({
      data: {
        authId: SINGLE_USER_AUTH_ID,
        email: this.env.SINGLE_USER_EMAIL,
        name: this.env.SINGLE_USER_NAME,
        role: 'ADMIN',
        plan: 'ENTERPRISE',
        ledger: {
          create: { kind: 'GRANT', amount: 100_000, description: 'Instalação single-user' },
        },
      },
      select: { id: true, authId: true, email: true, role: true, plan: true },
    });

    this.logger.log(`Modo single-user ativo — dono: ${created.email}`);
    this.owner = created;
    return created;
  }
}
