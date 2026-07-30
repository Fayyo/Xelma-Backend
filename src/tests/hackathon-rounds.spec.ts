import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';

const mockGetRoundsForApi = jest.fn();
const mockGetActiveRound = jest.fn();

jest.mock('../services/round.service', () => ({
  __esModule: true,
  default: {
    getRoundsForApi: (...args: any[]) => mockGetRoundsForApi(...args),
  },
}));

jest.mock('../services/soroban.service', () => ({
  __esModule: true,
  default: {
    getActiveRound: (...args: any[]) => mockGetActiveRound(...args),
    isReady: jest.fn().mockReturnValue(false),
    getUserStats: jest.fn(),
    getPendingWinnings: jest.fn(),
    getBalance: jest.fn(),
    getHealth: jest.fn(),
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
  const pass = (_req: any, _res: any, next: any) => next();
  return { apiRateLimiter: pass, writeRateLimiter: pass, betRateLimiter: pass };
});

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
      closesAt: new Date(Date.now() + 3600000).toISOString(),
    },
  ],
};

describe('GET /api/rounds — delegating to shared round service', () => {
  let app: Express;

  beforeEach(() => {
    mockGetActiveRound.mockRejectedValue(new Error('RPC unavailable'));
    mockGetRoundsForApi.mockResolvedValue(MOCK_ROUND_RESPONSE);
    app = createApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns mock rounds when service returns mock source', async () => {
    const res = await request(app).get('/api/rounds');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('mock');
    expect(Array.isArray(res.body.data.rounds)).toBe(true);
  });

  it('response always uses envelope with success and data', async () => {
    const res = await request(app).get('/api/rounds');

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('source');
    expect(res.body.data).toHaveProperty('rounds');
    expect(res.body).not.toHaveProperty('rounds');
  });

  it('propagates service errors to the error handler', async () => {
    mockGetRoundsForApi.mockRejectedValueOnce(new Error('Unexpected error'));

    const res = await request(app).get('/api/rounds');

    expect(res.status).toBe(500);
  });
});
