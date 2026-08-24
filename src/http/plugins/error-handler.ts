import type { FastifyInstance, FastifyError } from 'fastify';
import {
  AppError,
  UserNotFoundError,
  LimitExceededError,
} from '../../domain';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError) {
      const body: Record<string, unknown> = {
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
      };

      if (error instanceof UserNotFoundError) {
        body.details = { userId: error.userId };
      } else if (error instanceof LimitExceededError) {
        body.details = { remaining: error.remaining, limit: error.limit };
      }

      return reply.status(error.statusCode).send(body);
    }

    // Fastify validation errors (Zod)
    if (error.statusCode === 400 || (error as FastifyError & { validation?: unknown }).validation) {
      return reply.status(422).send({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: error.message,
        details: { fields: (error as FastifyError & { validation?: unknown[] }).validation ?? [] },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });
}
