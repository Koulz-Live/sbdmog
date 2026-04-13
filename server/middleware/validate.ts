// api/middleware/validate.ts
// Zod request body validation middleware factory.

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error:  'Validation failed.',
        issues: result.error.issues,
      });
      return;
    }
    // Replace req.body with the parsed, typed value
    req.body = result.data;
    next();
  };
}
