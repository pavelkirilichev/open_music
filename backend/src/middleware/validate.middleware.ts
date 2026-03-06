import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/errors';

type Target = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, target: Target = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]);
      // Replace with validated/coerced data
      (req as unknown as Record<string, unknown>)[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new AppError(
            400,
            'Validation error: ' + err.errors.map((e) => e.message).join(', '),
            'VALIDATION_ERROR',
          ),
        );
      } else {
        next(err);
      }
    }
  };
