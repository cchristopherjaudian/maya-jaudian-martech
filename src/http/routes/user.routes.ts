import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { UserService } from '../../services/user.service';
import { mobileNumberSchema } from '../../domain/schemas';

const CreateUserBody = z.object({
  mobileNumber: mobileNumberSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const UserResponse = z.object({
  id: z.string(),
  mobileNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const UserParams = z.object({ userId: z.string().uuid() });

export function userRoutes(userService: UserService) {
  return async function (app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/users',
      {
        schema: {
          response: { 200: z.array(UserResponse) },
          tags: ['Users'],
          description: 'List all registered users, ordered by registration date (newest first)',
        },
      },
      async (_request, reply) => {
        const users = await userService.listUsers();
        return reply.send(
          users.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
          })),
        );
      },
    );

    typed.post(
      '/users',
      {
        schema: {
          body: CreateUserBody,
          response: { 201: UserResponse },
          tags: ['Users'],
        },
      },
      async (request, reply) => {
        const user = await userService.createUser(request.body);
        return reply.status(201).send({
          ...user,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
      },
    );

    typed.get(
      '/users/:userId',
      {
        schema: {
          params: UserParams,
          response: { 200: UserResponse },
          tags: ['Users'],
        },
      },
      async (request, reply) => {
        const user = await userService.getUserById(request.params.userId);
        return reply.send({
          ...user,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
      },
    );
  };
}
