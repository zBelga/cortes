import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../errors/domain-error';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: unknown;
}

/** Tradução única de qualquer exceção para RFC 7807. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = (request.headers['x-request-id'] as string) ?? request.id;

    const problem = this.toProblem(exception, request.url, requestId);

    if (problem.status >= 500) {
      this.logger.error(
        { err: exception, requestId, url: request.url },
        `Erro não tratado: ${problem.detail}`,
      );
    } else {
      this.logger.warn({ requestId, code: problem.code, url: request.url }, problem.title);
    }

    void reply.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, url: string, requestId: string): ProblemDetails {
    const base = { type: 'about:blank', instance: url, requestId };

    if (exception instanceof DomainError) {
      return {
        ...base,
        title: exception.message,
        status: exception.httpStatus,
        code: exception.code,
        errors: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        ...base,
        title: 'Dados inválidos',
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        ...base,
        title: exception.message,
        status: exception.getStatus(),
        code: 'HTTP_ERROR',
        errors: typeof response === 'object' ? response : undefined,
      };
    }

    return {
      ...base,
      title: 'Erro interno',
      status: 500,
      code: 'INTERNAL_ERROR',
      // Nunca vaze stack trace ou mensagem interna para o cliente.
      detail: 'Algo deu errado do nosso lado. A equipe foi notificada.',
    };
  }
}
