import type { Logger } from 'pino';
import type { SubscriptionAccess } from '@society-erp/shared';

declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
      sessionId: string;
      /** society encoded in the access token (null for platform-context tokens) */
      societyId: string | null;
      /** true when the token was issued for the platform console */
      isPlatform: boolean;
      email: string;
      name: string;
    }

    interface TenantContext {
      societyId: string;
      society: {
        id: string;
        name: string;
        slug: string;
        status: string;
        timezone: string;
        currency: string;
      };
      membershipId: string;
      residentId: string | null;
      /** unit ids linked to the caller's resident profile (own-scope filtering) */
      unitIds: string[];
      roleIds: string[];
      roleKeys: string[];
      permissions: Set<string>;
      accessibleModules: Set<string>;
      subscription: SubscriptionAccess;
    }

    interface PlatformContext {
      permissions: Set<string>;
      roleKeys: string[];
    }

    interface Request {
      id: string;
      log: Logger;
      auth?: AuthContext;
      tenant?: TenantContext;
      platform?: PlatformContext;
      /** raw body retained for webhook signature verification */
      rawBody?: Buffer;
      /** module key resolved by requireModule() */
      moduleKey?: string;
      /** own-scope indicator resolved by authorizePermission() when only an *_own permission matched */
      ownScope?: boolean;
    }
  }
}

export {};
