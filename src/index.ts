const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajorVersion < 22 && process.env.NODE_ENV !== 'test') {
  logger.error('Application startup failed: Node.js v22.x or higher is required', {
    nodeVersion: process.version,
    hint: 'Upgrade Node.js to avoid local vs Render mismatches.',
  });
  process.exit(1);
}

import { Express } from 'express';
import dotenv from 'dotenv';
import { assertPreflightOrExit } from './config/preflight';
import { createServer, Server as HttpServer } from 'http';
import priceOracle from './services/oracle';
import websocketService from './services/websocket.service';
import schedulerService from './services/scheduler.service';
import roundSchedulerService from './services/round-scheduler.service';
import oracleService from './services/oracle.service';
import logger from './utils/logger';
import { validateVendoredBindings } from './utils/bindings-validator';
import config from './config';
import { createApp as createAppFromFactory, AppFeatures } from './app-factory';
// Route and middleware imports moved to src/app-factory.ts; only the Soroban
// env resolver is still used here, by the startup log below.
import {
  formatResolvedSorobanConfigForLog,
  resolveSorobanEnvVars,
} from './config/env';
import { initializeSocket, closeWebSocket } from './socket';
import { prisma } from './lib/prisma';
import path from 'path';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: false });
dotenv.config({ override: false });

export { getHttpCorsOrigins } from './utils/cors';

const validateEnv = (): void => {
   if (!process.env.JWT_SECRET) {
      logger.error('Application startup failed: Missing required environment variable: JWT_SECRET', {
         variable: 'JWT_SECRET',
      });
      logger.error('Please configure this securely in your environment before starting the app.');
      process.exit(1); // 1 indicates a failure/error state
   }
};

/**
 * Validate the vendored @tevalabs/xelma-bindings package at startup so a
 * stale or partial vendor surfaces immediately, instead of as an opaque
 * "Cannot find module" deep inside the Soroban service later. Only logs —
 * never throws — because API-only deployments may run without Soroban.
 */
function logBindingsValidation(): void {
   const result = validateVendoredBindings();
   if (result.ok) {
      logger.info('Vendored bindings OK', {
         vendorPath: result.info.vendorPath,
         packageName: result.info.packageName,
         commitSha: result.info.commitSha,
      });
   } else {
      logger.warn(
         'Vendored bindings validation failed; Soroban integration may fail at runtime',
         {
            vendorPath: result.info.vendorPath,
            errors: result.errors,
            commitSha: result.info.commitSha,
         }
      );
   }
}

// Run preflight gate before anything else initializes
assertPreflightOrExit();

// Execute validation immediately
validateEnv();
logBindingsValidation();
logger.info(`Active DATA_MODE=${config.app.dataMode}`);
logger.info(`ROUNDS_MOCK_MODE=${config.app.roundsMockMode}`);
logger.info(
  'Soroban configuration resolved',
  formatResolvedSorobanConfigForLog(resolveSorobanEnvVars(), {
    rpcUrl: config.soroban.rpcUrl,
    network: config.soroban.network,
  }),
);

const betStubMode = process.env.BET_STUB_MODE === "true";
logger.info(`Bet mode: ${betStubMode ? "STUB (no on-chain calls)" : "ON-CHAIN (Soroban)"}`, {
  BET_STUB_MODE: betStubMode,
});
logger.info(
  `Soroban money-path policy: ${config.soroban.failClosed ? "FAIL-CLOSED (abort on chain failure)" : "FAIL-OPEN (DB-only fallback allowed)"}`,
  { SOROBAN_FAIL_CLOSED: config.soroban.failClosed },
);
logger.info('Runtime modes documented at docs/runtime-modes.md');

/**
 * Create and configure the Express app without starting any background
 * jobs or binding to a network port. Safe to import in tests.
 *
 * HTTP wiring lives in `src/app-factory.ts` and is shared with the hackathon
 * entrypoint; this only selects the full feature set. See CONTRIBUTING.md for
 * the flag matrix.
 */
export function createApp(): Express {
   const app = express();

   // Security headers (before all routes)
   app.use(securityHeaders);

   // CORS — origin allowlist is driven by CLIENT_URL / ALLOWED_ORIGINS env vars
   app.use(
      cors({
         origin: getHttpCorsOrigins(),
         methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
         allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
         credentials: true,
      })
   );

   app.use(express.json());
   app.use(express.urlencoded({ extended: true }));

   // Request ID middleware (first, so all subsequent middleware has access)
   app.use(requestIdMiddleware);

   // Prometheus metrics middleware (before routes so all requests are tracked)
   app.use(metricsMiddleware);

   // Request logging middleware
   app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = (req as any).requestId;
      logger.info(`${req.method} ${req.path}`, { requestId });
      next();
   });

    // API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/user', userRoutes);
    app.use('/api/rounds', roundsRoutes);
    app.use('/api/bets', betsRoutes);
    app.use('/api/predictions', predictionsRoutes);
    app.use('/api/education', educationRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/notifications', notificationsRoutes);
    app.use('/api/tournaments', tournamentsRoutes);
    app.use('/api/admin/metrics', adminMetricsRoutes);
    app.use('/api/errors', errorsRoutes);
    app.use('/api/admin/cors-diagnostics', corsDiagnosticsRoutes);
     app.use('/api/admin/dead-letter', deadLetterRoutes);
     app.use('/health', healthRoutes);

     // Versioned API v1 router (same routes, under /api/v1 prefix)
    const v1Router = Router();
    v1Router.use('/auth', authRoutes);
    v1Router.use('/user', userRoutes);
    v1Router.use('/rounds', roundsRoutes);
    v1Router.use('/bets', betsRoutes);
    v1Router.use('/predictions', predictionsRoutes);
    v1Router.use('/education', educationRoutes);
    v1Router.use('/leaderboard', leaderboardRoutes);
    v1Router.use('/chat', chatRoutes);
    v1Router.use('/notifications', notificationsRoutes);
    v1Router.use('/tournaments', tournamentsRoutes);
    v1Router.use('/admin/metrics', adminMetricsRoutes);
    v1Router.use('/errors', errorsRoutes);
    v1Router.use('/admin/cors-diagnostics', corsDiagnosticsRoutes);
    v1Router.use('/admin/dead-letter', deadLetterRoutes);
    v1Router.use('/', pricesRoutes);
    app.use('/api/v1', v1Router);

    // Deprecation headers for legacy unversioned /api/* paths
    app.use('/api', (req, res, next) => {
       if (!req.path.startsWith('/v1')) {
          res.setHeader('Deprecation', 'true');
          res.setHeader('Sunset', 'Sat, 01 Jan 2027 00:00:00 GMT');
          res.setHeader('Link', `</api/v1${req.path}>; rel="successor-version"`);
       }
       next();
    });

   // Prometheus metrics endpoint
   app.use('/metrics', metricsRoutes);

   // Swagger UI (OpenAPI)
   app.get('/docs', (req: Request, res: Response) =>
      res.redirect(302, '/api-docs')
   );
   app.get('/api-docs.json', (req: Request, res: Response) =>
      res.json(swaggerSpec)
   );
   app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, { explorer: true })
   );

   // Hello World endpoint
   app.get('/', (req: Request, res: Response) => {
      res.json({
         message: 'Hello World! Xelma Backend is running',
         timestamp: new Date().toISOString(),
         status: 'OK',
      });
    });

    // Multi-asset prices via CoinGecko (BTC, ETH, XLM)
   app.use('/api', pricesRoutes);

    // Price Oracle endpoint (returns price_usd as a precise decimal string)
   app.get('/api/price', (req: Request, res: Response) => {
      const price = priceOracle.getPriceString();
      const lastUpdatedAt = priceOracle.getLastUpdatedAt();
      res.json({
         asset: 'XLM',
         price_usd: price,
         stale: priceOracle.isStale(),
         provider: priceOracle.getLastProvider(),
         lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
         source: priceOracle.getActiveSource(),
         timestamp: new Date().toISOString(),
      });
   });

   // 404 handler - forward to error handler for consistent response format
   app.use((req: Request, res: Response, next: NextFunction) => {
      const { NotFoundError } = require('./utils/errors');
      next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
   });

   // Centralized error handler (must be last)
   app.use(errorHandler);

   return app;
export function createApp(features?: Partial<AppFeatures>): Express {
   return createAppFromFactory({ mode: 'full', features }) as Express;
}

interface ServerHandle {
   httpServer: HttpServer;
   cleanup: () => Promise<void>;
}

/**
 * Returns true when the process should run as a stateless API only —
 * no oracle polling, no cron schedulers, no WebSocket price ticker.
 * Useful for split deployments where one process owns background work
 * and others serve HTTP, and for safer local debugging.
 */
export function isApiOnlyMode(): boolean {
   const raw = process.env.API_ONLY;
   if (!raw) return false;
   return raw.toLowerCase() === 'true';
}

/**
 * Start background services, bind to a port, and return a handle that
 * can be used to shut everything down cleanly.
 *
 * When API_ONLY=true, schedulers, oracle polling, and the WebSocket
 * price ticker are skipped. The HTTP server (and Socket.IO transport)
 * still come up, so request-driven endpoints remain available.
 */
export async function startServer(app: Express): Promise<ServerHandle> {
   const PORT = process.env.PORT || 3000;
   const httpServer = createServer(app);
   const apiOnly = isApiOnlyMode();

   // Initialize Socket.IO with JWT authentication and Redis adapter
   await initializeSocket(httpServer);

   let priceInterval: NodeJS.Timeout | null = null;

   if (apiOnly) {
      logger.info(
         'API_ONLY=true: skipping oracle polling, round scheduler, and WebSocket price ticker. Outbox poller and retention jobs still run.'
      );
      // The general scheduler (outbox poller, notification cleanup, retention)
      // must run even in API_ONLY mode so outbox events written by this process
      // are dispatched. Only oracle polling, round scheduling, and the price
      // ticker are skipped.
      schedulerService.start();
   } else {
      // Start Oracle Polling
      priceOracle.startPolling();

      // Initialize Schedulers
      schedulerService.start();
      roundSchedulerService.start();
      oracleService.start();

      // Emit price updates via WebSocket
      priceInterval = setInterval(() => {
         const price = priceOracle.getPriceString();
         if (price !== null) {
            websocketService.emitPriceUpdate('XLM', price);
         }
      }, 5000);
   }

   const cleanup = async () => {
      logger.info('Shutting down gracefully...');
      if (priceInterval) {
         clearInterval(priceInterval);
      }
      closeWebSocket();
      if (!apiOnly) {
         priceOracle.stopPolling();
         roundSchedulerService.stop();
         oracleService.stop();
      }
      // Always stop the general scheduler (outbox poller, cleanup jobs)
      schedulerService.stop();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => {
         httpServer.close(() => resolve());
      });
      await prisma.$disconnect();
      logger.info('Shutdown complete');
   };

   httpServer.listen(PORT, () => {
      logger.info(`Server is running on http://localhost:${PORT}`);
      logger.info(`Socket.IO is ready for connections`);
   });

   return { httpServer, cleanup };
}

// Only start the server when this file is executed directly (not imported)
const app = createApp();

if (require.main === module) {
   (async () => {
      const { cleanup } = await startServer(app);

      process.on('SIGINT', async () => {
         await cleanup();
         process.exit(0);
      });

      process.on('SIGTERM', async () => {
         await cleanup();
         process.exit(0);
      });
   })().catch(err => {
      logger.error('Failed to start server', {
         error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
   });
}

export default app;
