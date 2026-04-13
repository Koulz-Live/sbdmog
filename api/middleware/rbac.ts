// api/middleware/rbac.ts
// Role-based access control middleware factory.
// Usage: router.post('/route', authMiddleware, requireRole('admin', 'engineer'), handler)

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { can } from '@heqcis/core';
import type { Role } from '@heqcis/types';

type Resource = Parameters<typeof can>[2];
type Action   = Parameters<typeof can>[1];

/**
 * Middleware that checks whether the authenticated user's role can perform
 * `action` on `resource`. Returns 403 if not permitted.
 *
 * Typed as `RequestHandler` so Express overload resolution accepts it alongside
 * plain `(req: Request, ...)` handlers in the same route chain.
 */
export function requirePermission(action: Action, resource: Resource): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req as AuthenticatedRequest;
    const role = authed.user?.role as Role | undefined;
    if (!role || !can(role, action, resource)) {
      res.status(403).json({
        error: `Role '${role ?? 'unknown'}' is not permitted to ${action} ${resource}.`,
      });
      return;
    }
    next();
  };
}

/**
 * Middleware that restricts a route to one or more explicit roles.
 *
 * Typed as `RequestHandler` so Express overload resolution accepts it alongside
 * plain `(req: Request, ...)` handlers in the same route chain.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req as AuthenticatedRequest;
    if (!roles.includes(authed.user?.role as Role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}
