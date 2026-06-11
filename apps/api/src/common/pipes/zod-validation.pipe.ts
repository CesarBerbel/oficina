import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodError, type ZodTypeAny } from 'zod';

/**
 * Pipe de validação com Zod. Usa os mesmos schemas do pacote @oficina/shared,
 * garantindo validação idêntica entre frontend e backend.
 *
 * O schema é aceito como ZodTypeAny para permitir schemas com preprocess/coerce,
 * cujo tipo de entrada pode ser `unknown`, mas cujo retorno continua tipado pelo
 * parâmetro genérico do pipe.
 *
 * Uso: `@Body(new ZodValidationPipe<LoginInput>(loginSchema)) body: LoginInput`
 */
export class ZodValidationPipe<T = unknown> implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value) as T;
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: details
            .map((detail) => `${detail.path || 'Campo'}: ${detail.message}`)
            .join('; '),
          details,
        });
      }
      throw err;
    }
  }
}
