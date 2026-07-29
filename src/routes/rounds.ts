import { Router, Request, Response, NextFunction } from 'express';
import { betRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate.middleware';
import {
  verifyStellarAuth,
  bindAuthenticatedWallet,
} from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/response';
import { betSchema, upDownBetSchema, precisionBetSchema } from '../schemas/bets.schema';

import config from '../config';
import { getRepositories } from '../repositories';
import roundService from '../services/round.service';
import sorobanService from '../services/soroban.service';
import hackathonService from '../services/hackathon.service';
import { mapSorobanRoundToFrontendCards } from '../utils/soroban-round.mapper';
import logger from '../utils/logger';
import { toDecimalString } from '../utils/decimal.util';

const router = Router();

/**
 * @openapi
 * /api/rounds:
 *   get:
 *     summary: List active prediction rounds
 *     description: Returns on-chain active round when Soroban is configured; falls back to database rounds, then to mock data when chain is unavailable or ROUNDS_MOCK_MODE=true.
 *     tags:
 *       - rounds
 *     responses:
 *       200:
 *         description: Active rounds with source metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 source:
 *                   type: string
 *                   enum: [soroban, database, mock]
 *                 rounds:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!config.app.roundsMockMode) {
      try {
        const onChainRound = await sorobanService.getActiveRound();
        const cards = mapSorobanRoundToFrontendCards(onChainRound);
        const payload = {
          source: onChainRound ? 'soroban' : 'mock',
          rounds: cards,
        };
        return res.json({
          success: true,
          data: payload,
          source: payload.source,
          rounds: payload.rounds,
          payload,
        });
      } catch (err) {
        logger.warn('Soroban fetch failed; falling back to mock rounds', {
          error: (err as Error).message,
        });
      }
    }

    const { source, rounds } = await roundService.getRoundsForApi();
    return res.json({
      success: true,
      data: { source, rounds },
      source,
      rounds,
      payload: { source, rounds },
    });
  } catch (err) {
    next(err);
  }
});

// Hackathon bet mutation endpoints — protect with the same Stellar JWT auth
// used by /api/bets/*. The middleware chain enforces in this order:
//   1. verifyStellarAuth    — reject when no/invalid Bearer token (401)
//   2. bindAuthenticatedWallet — reject when body address does not match
//      the JWT-authenticated wallet, and normalize req.body.address to the
//      authenticated wallet so downstream handlers cannot be tricked.
//   3. validate(schema)     — Zod validation of type-safe numeric fields.
// Closes #399: demo bet APIs are no longer unauthenticated relays.
const hackathonBetAuth = [
  verifyStellarAuth,
  bindAuthenticatedWallet,
] as const;

// TODO: Call contract via Xelma TypeScript bindings — bets must go on-chain; this endpoint is logging/analytics only for now
router.post('/:id/bet', betRateLimiter, ...hackathonBetAuth, validate(betSchema), (_req, res) => {
  res.json({ success: true, message: 'Bet recorded (stub)' });
});

// Hackathon mutation endpoints - with Zod validation for consistent error handling
router.post(
  '/hackathon/up-down/:id/bet',
  betRateLimiter,
  ...hackathonBetAuth,
  validate(upDownBetSchema),
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { address, amount, side } = req.body;
      await getRepositories().rounds.placeBet(id, address, amount, side);
      sendSuccess(res, { message: 'Bet recorded (stub)' });
    } catch (err) {
      next(err);
    }
  }) as any,
);

router.post(
  '/hackathon/precision/:id/bet',
  betRateLimiter,
  ...hackathonBetAuth,
  validate(precisionBetSchema),
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { address, amount, predictedPrice } = req.body;
      await getRepositories().rounds.placeBet(id, address, amount, undefined, predictedPrice);
      sendSuccess(res, { message: 'Precision bet recorded (stub)' });
    } catch (err) {
      next(err);
    }
  }) as any,
);

export default router;
