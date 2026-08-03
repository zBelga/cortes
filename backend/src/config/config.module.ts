import { Global, Module } from '@nestjs/common';
import { env } from './env';
import type { Env } from './env.schema';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => env() }],
  exports: [ENV],
})
export class ConfigModule {}
