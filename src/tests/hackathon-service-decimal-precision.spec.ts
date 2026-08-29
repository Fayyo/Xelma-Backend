import { describe, it, expect, beforeEach } from '@jest/globals';

interface FakeUser {
  address: string;
  balance: number;
  pendingWinnings: number;
  totalWins: number;
  totalLosses: number;
  currentStreak: number;
  xp: number;
  rankTitle: string;
}

interface FakeRound {
  id: string;
  mode: 'updown' | 'precision';
  poolUp: number;
  poolDown: number;
  totalPool: number;
  predictionCount: number;
}

let mockUsers: FakeUser[];
let mockRounds: FakeRound[];

jest.mock('../lib/prisma', () => {
  return {
    __esModule: true,
    prisma: {
      mockLeaderboard: {
        findUnique: async ({ where }: { where: { address: string } }) =>
          mockUsers.find(user => user.address === where.address) ?? null,
        create: async ({ data }: { data: FakeUser }) => {
          mockUsers.push(data);
          return data;
        },
        update: async ({ data }: { data: Partial<FakeUser> }) => {
          Object.assign(mockUsers[0], data);
          return mockUsers[0];
        },
      },
      mockBet: {
        create: async () => undefined,
      },
      mockRound: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          mockRounds.find(round => round.id === where.id) ?? null,
        update: async ({ data }: { data: Partial<FakeRound> }) => {
          Object.assign(mockRounds[0], data);
          return mockRounds[0];
        },
      },
    },
  };
});

describe('hackathon.service Decimal-safe balance/pool math', () => {
  beforeEach(() => {
    mockUsers = [
      {
        address: 'GADDR',
        balance: 10.3,
        pendingWinnings: 0,
        totalWins: 0,
        totalLosses: 0,
        currentStreak: 0,
        xp: 0,
        rankTitle: 'Rookie',
      },
    ];
    mockRounds = [
      { id: 'r1', mode: 'updown', poolUp: 0.1, poolDown: 0, totalPool: 0.1, predictionCount: 0 },
    ];
  });

  it('deducts a fractional bet amount from balance without float drift', async () => {
    const hackathonService = (await import('../services/hackathon.service')).default;

    await hackathonService.placeBet('r1', 'GADDR', 0.2, 'UP');

    // 10.3 - 0.2 is 10.1, not the 10.099999999999998 native float math gives.
    expect(mockUsers[0].balance).toBe(10.1);
  });

  it('floors balance at zero instead of going negative', async () => {
    const hackathonService = (await import('../services/hackathon.service')).default;

    await hackathonService.placeBet('r1', 'GADDR', 999, 'UP');

    expect(mockUsers[0].balance).toBe(0);
  });

  it('accumulates the round pool with Decimal-safe addition', async () => {
    const hackathonService = (await import('../services/hackathon.service')).default;

    await hackathonService.placeBet('r1', 'GADDR', 0.2, 'UP');

    expect(mockRounds[0].poolUp).toBe(0.3);
  });
});
