import { PipeTransform, Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Valida e **transforma** a entrada: o controller recebe o tipo já inferido. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    // ZodError é capturado pelo AllExceptionsFilter e vira 422 com o caminho do campo.
    return this.schema.parse(value);
  }
}

export const zodPipe = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
