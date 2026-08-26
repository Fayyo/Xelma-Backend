import { Router, Request, Response } from 'express';
import { getPrices } from '../services/priceService';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

/**
 * @openapi
 * /api/prices:
 *   get:
 *     summary: Live BTC, ETH, and XLM prices
 *     description: |
 *       Fetches USD prices from CoinGecko with a 30-second in-memory cache.
 *       When CoinGecko is temporarily unavailable, returns the last cached
 *       values with `stale: true`.
 *     tags:
 *       - prices
 *     responses:
 *       200:
 *         description: Current market prices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PriceResponse'
 *       503:
 *         description: Price service unavailable (no cache)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
router.get('/prices', async (_req: Request, res: Response) => {
  try {
    const snapshot = await getPrices();
    sendSuccess(res, snapshot);
  } catch (error) {
    sendError(
      res,
      error instanceof Error
        ? error.message
        : 'Unable to fetch prices and no cached data is available',
      503
    );
  }
});

export default router;
