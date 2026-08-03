import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { TIMEOUT_KEY } from '../decorators/timeout.decorator';

/** Teto padrão. Trabalho mais longo que isto pertence a uma fila, não a um request. */
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ms =
      this.reflector.getAllAndOverride<number | undefined>(TIMEOUT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(ms),
      catchError((error) =>
        throwError(() =>
          // RequestTimeoutException vira 408 no filter global, em vez do
          // 500 genérico que um Error solto produziria.
          error instanceof TimeoutError
            ? new RequestTimeoutException('A requisição excedeu o tempo limite')
            : error,
        ),
      ),
    );
  }
}
