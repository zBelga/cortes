import { SetMetadata } from '@nestjs/common';

export const TIMEOUT_KEY = 'clipforge:timeoutMs';

/**
 * Sobrescreve o timeout padrão da rota.
 *
 * Use com parcimônia: se uma rota precisa de muito tempo, quase sempre o
 * trabalho deveria estar numa fila. A exceção legítima é uma chamada externa
 * curta e obrigatória antes de responder — como ler os metadados de um vídeo
 * para estimar o custo em créditos.
 */
export const Timeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);
