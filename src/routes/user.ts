import { Router, Request, Response, NextFunction } from 'express';
import { validateStellarAddressParam } from '../utils/stellar-address.util';
import hackathonService from '../services/hackathon.service';

const router = Router();

/**
 * Computes an XP score from on-chain user stats.
 * XP = totalWins × 100 + bestStreak × 50
 */
function computeXp(totalWins: number, bestStreak: number): number {
  return totalWins * 100 + bestStreak * 50;
}

/**
 * Derives a rank title from XP.
 * Thresholds match production profile expectations.
 */
function computeRankTitle(xp: number): string {
  if (xp >= 10000) return 'Diamond';
  if (xp >= 5000) return 'Platinum';
  if (xp >= 3000) return 'Gold';
  if (xp >= 1500) return 'Silver';
  if (xp >= 500) return 'Bronze';
  return 'Rookie';
}

/**
 * @openapi
 * /api/user/{address}/stats:
 *   get:
 *     summary: Return per-wallet stats for a Stellar address (hackathon)
 *     tags:
 *       - user
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet-specific stats matching production profile contract
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalWins:
 *                       type: integer
 *                     totalLosses:
 *                       type: integer
 *                     currentStreak:
 *                       type: integer
 *                     pendingWinnings:
 *                       type: string
 *                     isRegistered:
 *                       type: boolean
 *                 profile:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                     xp:
 *                       type: integer
 *                     rankTitle:
 *                       type: string
 *       400:
 *         description: Invalid wallet address
 */
router.get('/:address/stats', validateStellarAddressParam('address'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;

    const hackStats = await hackathonService.getUserStats(address);

    // Align with production profile contract shape:
    // Always return { success, stats, profile } so frontend profile panels work
    // identically regardless of which server they hit.
    return res.json({
      success: true,
      stats: {
        totalWins: hackStats.totalWins,
        totalLosses: hackStats.totalLosses,
        currentStreak: hackStats.currentStreak,
        pendingWinnings: String(hackStats.pendingWinnings),
        isRegistered: hackStats.totalWins > 0 || hackStats.totalLosses > 0,
      },
      profile: {
        balance: hackStats.balance,
        xp: computeXp(hackStats.totalWins, hackStats.currentStreak),
        rankTitle: computeRankTitle(computeXp(hackStats.totalWins, hackStats.currentStreak)),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
