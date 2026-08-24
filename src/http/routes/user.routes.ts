import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { UserService } from '../../services/user.service';

const CreateUserBody = z.object({
  mobileNumber: z.string().min(1),
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

const UserParams = z.object({ userId: z.string() });

export function userRoutes(userService: UserService) {
  return async function (app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

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
