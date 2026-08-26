import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';

const mockGetRoundsForApi = jest.fn();
const mockGetActiveRound = jest.fn();

jest.mock('../services/round.service', () => ({
  __esModule: true,
  default: {
    getRoundsForApi: (...args: unknown[]) => mockGetRoundsForApi(...args),
  },
}));

jest.mock('../services/soroban.service', () => ({
  __esModule: true,
  default: {
    getActiveRound: (...args: unknown[]) => mockGetActiveRound(...args),
    isReady: jest.fn().mockReturnValue(false),
    getHealth: jest.fn().mockResolvedValue({ initialized: false }),
  },
}));

jest.mock('../services/hackathon.service', () => ({
  __esModule: true,
  default: {
    placeBet: jest.fn().mockResolvedValue(undefined),
    getRounds: jest.fn().mockResolvedValue([]),
    getLeaderboard: jest.fn().mockResolvedValue([]),
    getUserStats: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../middleware/rateLimiter', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { apiRateLimiter: pass, writeRateLimiter: pass, betRateLimiter: pass };
});

const SOROBAN_ROUND = {
  round_id: 1n,
  mode: 0,
  price_start: 2_891n,
  pool_up: 28_000_000n,
  pool_down: 14_000_000n,
  start_ledger: 100n,
  bet_end_ledger: 200n,
  end_ledger: 300n,
};

const MOCK_ROUND_RESPONSE = {
  source: 'mock',
  rounds: [
    {
      id: 'btc-updown-live',
      asset: 'XLM',
      mode: 'updown',
      status: 'live',
      startPrice: 0.5,
      poolUp: 100,
      poolDown: 200,
      closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  ],
};

describe('GET /api/rounds', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
    mockGetRoundsForApi.mockReset();
    mockGetActiveRound.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns a Soroban round when one is available', async () => {
    mockGetActiveRound.mockResolvedValueOnce(SOROBAN_ROUND);

    const res = await request(app).get('/api/rounds');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, source: 'soroban' }));
    expect(res.body.data.source).toBe('soroban');
    expect(res.body.data.rounds[0]).toEqual(
      expect.objectContaining({
        id: 'soroban-1',
        asset: 'XLM',
        mode: 'updown',
        status: 'live',
        isSoroban: true,
      }),
    );
  });

  it('returns mock frontend cards when Soroban has no active round', async () => {
    mockGetActiveRound.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/rounds');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, source: 'mock' }));
    expect(res.body.data.rounds).toHaveLength(3);
    expect(mockGetRoundsForApi).not.toHaveBeenCalled();
  });

  it('falls back to the shared service when Soroban fails', async () => {
    mockGetActiveRound.mockRejectedValueOnce(new Error('RPC unavailable'));
    mockGetRoundsForApi.mockResolvedValueOnce(MOCK_ROUND_RESPONSE);

    const res = await request(app).get('/api/rounds');

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('mock');
    expect(mockGetRoundsForApi).toHaveBeenCalledTimes(1);
  });
});
