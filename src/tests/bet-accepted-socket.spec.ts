import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("../services/soroban.service", () => ({
  __esModule: true,
  default: {
    placeBet: jest.fn(),
    placePrecisionBet: jest.fn(),
  },
}));

jest.mock("../services/bet-audit.service", () => ({
  __esModule: true,
  default: {
    emitBetAccepted: jest.fn(),
  },
  betAuditService: {
    emitBetAccepted: jest.fn(),
  },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const emitMock = jest.fn();
const toMock = jest.fn(() => ({ emit: emitMock }));

jest.mock("../lib/prisma", () => ({
  prisma: {
    round: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock("../services/dead-letter-queue.service", () => ({
  __esModule: true,
  default: { record: jest.fn() },
}));

jest.mock("../metrics/application.metrics", () => ({
  websocketEmitsTotal: { inc: jest.fn() },
}));

import betService from "../services/bet.service";
import sorobanService from "../services/soroban.service";
import websocketService, {
  WebSocketEvents,
} from "../services/websocket.service";

const VALID_ADDRESS = "GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

describe("bet:accepted websocket emission (#376)", () => {
  const originalStub = process.env.BET_STUB_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    emitMock.mockClear();
    toMock.mockClear();
    websocketService.initialize({ to: toMock } as any);
  });

  afterEach(() => {
    process.env.BET_STUB_MODE = originalStub;
    (websocketService as any).io = null;
  });

  it("defines a stable bet:accepted event name", () => {
    expect(WebSocketEvents.BetAccepted).toBe("bet:accepted");
  });

  it("emits bet:accepted after a successful stub UP/DOWN bet", async () => {
    process.env.BET_STUB_MODE = "true";

    await betService.recordUpDownBet({
      address: VALID_ADDRESS,
      amount: 25,
      side: "UP",
    });

    expect(toMock).toHaveBeenCalledWith("round");
    expect(emitMock).toHaveBeenCalledWith(
      "bet:accepted",
      expect.objectContaining({
        address: VALID_ADDRESS,
        amount: 25,
        side: "UP",
        mode: "UP_DOWN",
        state: "stub",
        roundId: "btc-updown-live",
      }),
    );
    // Also published to the round-specific room when roundId is known
    expect(toMock).toHaveBeenCalledWith("round:btc-updown-live");
  });

  it("emits bet:accepted after a successful on-chain PRECISION bet", async () => {
    process.env.BET_STUB_MODE = "false";
    (sorobanService.placePrecisionBet as jest.Mock).mockResolvedValue({
      state: "on-chain-success",
      txHash: "0xdeadbeef",
    });

    await betService.recordPrecisionBet({
      address: VALID_ADDRESS,
      amount: 10,
      predictedPrice: 0.3,
    });

    expect(emitMock).toHaveBeenCalledWith(
      "bet:accepted",
      expect.objectContaining({
        address: VALID_ADDRESS,
        amount: 10,
        mode: "PRECISION",
        state: "on-chain-success",
        txHash: "0xdeadbeef",
        roundId: "eth-precision-live",
      }),
    );
  });

  it("does not emit bet:accepted when on-chain placement fails", async () => {
    process.env.BET_STUB_MODE = "false";
    (sorobanService.placeBet as jest.Mock).mockRejectedValue(
      new Error("rpc unavailable"),
    );

    await expect(
      betService.recordUpDownBet({
        address: VALID_ADDRESS,
        amount: 5,
        side: "DOWN",
      }),
    ).rejects.toThrow("rpc unavailable");

    expect(emitMock).not.toHaveBeenCalled();
  });
});
