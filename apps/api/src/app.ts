import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOrigins, env } from './config/env';
import { requestContext, apiRateLimiter, errorHandler, notFoundHandler } from './middleware';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );
  app.use(requestContext);
  // keep the raw body for webhook signature verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(apiRateLimiter);

  app.get('/', (_req, res) => res.json({ name: 'Society ERP API', docs: '/api/v1/health' }));
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
