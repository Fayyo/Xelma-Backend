import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import healthRoutes from './routes/health';
import statsRoutes from './routes/stats';
import roundsRoutes from './routes/rounds.routes';
import leaderboardRoutes from './routes/leaderboard';
import userRoutes from './routes/user.routes';
import betsRoutes from './routes/bets.routes';
import tournamentsRoutes from './routes/tournaments.routes';
import chatRoutes from './routes/chat.routes';
import notificationsRoutes from './routes/notifications.routes';
import { apiRateLimiter, writeRateLimiter } from './middleware/rateLimiter.middleware';
import { getHttpCorsOrigins } from './utils/cors';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { metricsMiddleware } from './middleware/metrics.middleware';
import metricsRoutes from './routes/metrics.routes';
import { hackathonSwaggerSpec } from './docs/hackathon-openapi';
import config from './config';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { httpLoggerMiddleware } from './middleware/httpLogger.middleware';
import { securityHeadersMiddleware } from './middleware/securityHeaders.middleware';
import logger from './utils/logger';

export interface CreateAppOptions {
  includeErrorHandlers?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Application {
  const { includeErrorHandlers = true } = options;
  const app: Application = express();

  app.use(express.json());
  app.use(
    cors({
      origin: getHttpCorsOrigins(),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      credentials: true,
    })
  );
  app.use(securityHeadersMiddleware);

  // Assign a correlation ID to every request and expose it on the response header
  app.use(requestIdMiddleware);

  // Prometheus metrics middleware (before routes so all requests are tracked)
  app.use(metricsMiddleware);

  // Structured Winston HTTP request logging with duration and correlation ID
  app.use(httpLoggerMiddleware);

  app.get('/docs', (_req, res) => res.redirect(302, '/api-docs'));
  app.get('/api-docs.json', (_req, res) => res.json(hackathonSwaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(hackathonSwaggerSpec, { explorer: true }));

  // Prometheus metrics endpoint
  app.use('/metrics', metricsRoutes);

  app.use('/api', apiRateLimiter);
  app.use('/api', writeRateLimiter);
  app.use('/api', healthRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/rounds', roundsRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/bets', betsRoutes);
  app.use('/api/tournaments', tournamentsRoutes);

  if (config.app.enableMultiplayerSocial) {
    app.use('/api/chat', chatRoutes);
    app.use('/api/notifications', notificationsRoutes);
  }

  app.use('/api', routes);

  // Centralized 404 and Error handlers registered last in the Express stack
  if (includeErrorHandlers) {
    app.use(notFoundHandler);
    app.use(errorHandler);
  }

  return app;
}

const app = createApp();
export default app;