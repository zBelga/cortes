import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';

/**
 * Só faz sentido com STORAGE_DRIVER=local. Com S3/R2, o próprio provedor
 * serve os arquivos e este controller nunca é chamado — deixá-lo registrado
 * é inofensivo e evita um import condicional no AppModule.
 */
@Module({ controllers: [FilesController] })
export class FilesModule {}
