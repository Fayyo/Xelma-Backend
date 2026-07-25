import dotenv from 'dotenv';
import { createServer } from 'http';

dotenv.config();

import { assertPreflightOrExit } from './config/preflight';
import app from './app';
import { initWebSocket } from './socket';
import logger from './utils/logger';

assertPreflightOrExit();

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

initWebSocket(httpServer).catch(error => {
  logger.error('WebSocket initialization failed', { error: (error as Error).message });
  process.exit(1);
});

httpServer.listen(PORT, () => {
  logger.info(`Hackathon server listening on port ${PORT}`);
});