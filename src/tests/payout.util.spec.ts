import { describe, it, expect } from "@jest/globals";
import {
  STROOPS_PER_XLM,
  stroopsToXlm,
  xlmToStroops,
  calculatePayout,
} from "../utils/payout.util";
import { toDecimal } from "../utils/decimal.util";

describe("payout.util", () => {
  it("converts stroops to XLM", () => {
    expect(STROOPS_PER_XLM).toBe(10_000_000);
    expect(stroopsToXlm(BigInt(50_000_000))).toBe(5);
    expect(stroopsToXlm(0)).toBe(0);
  });

  it("converts XLM to stroops", () => {
    expect(xlmToStroops(5)).toBe(BigInt(50_000_000));
    expect(xlmToStroops("1.5")).toBe(BigInt(15_000_000));
  });

  it("round-trips XLM through stroops", () => {
    expect(stroopsToXlm(xlmToStroops(7.25))).toBe(7.25);
  });

  it("calculatePayout still shares losing pool correctly", () => {
    const payout = calculatePayout(
      toDecimal(10),
      toDecimal(50),
      toDecimal(100)
    );
    expect(payout.toNumber()).toBe(30);
  });
});
