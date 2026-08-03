import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'clipforge:isPublic';

/** Marca a rota como acessível sem autenticação. Uso deliberado e raro. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
