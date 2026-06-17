import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ServiceOrderDomainError } from './domain/service-order.errors';

/** Traduz erros de regra de negócio da OS para HTTP 422. */
@Catch(ServiceOrderDomainError)
export class ServiceOrderExceptionFilter implements ExceptionFilter {
  catch(exception: ServiceOrderDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'BUSINESS_RULE',
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
