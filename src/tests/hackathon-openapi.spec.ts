import { describe, expect, it } from '@jest/globals';
import { hackathonSwaggerSpec } from '../docs/hackathon-openapi';

interface RequiredOperation {
  path: string;
  method: string;
  /** Response codes documented for this operation in its route file's JSDoc. */
  statuses: string[];
}

/**
 * The hackathon spec is generated from exactly 5 route files (see `apis` in
 * src/docs/hackathon-openapi.ts): health.ts, routes/index.ts, stats.ts,
 * rounds.ts, leaderboard.ts. Each documents exactly one operation, so this
 * list is the full set — if a route disappears from one of those files
 * (or the `apis` glob stops covering it), the corresponding entry below
 * fails instead of the gap going unnoticed.
 */
const REQUIRED_HACKATHON_OPERATIONS: RequiredOperation[] = [
  { path: '/health', method: 'get', statuses: ['200'] },
  { path: '/api/prices', method: 'get', statuses: ['200', '503'] },
  { path: '/api/stats', method: 'get', statuses: ['200', '500'] },
  { path: '/api/rounds', method: 'get', statuses: ['200'] },
  { path: '/api/leaderboard', method: 'get', statuses: ['200'] },
];

describe('Hackathon OpenAPI spec', () => {
  const paths = (hackathonSwaggerSpec as { paths?: Record<string, Record<string, any>> }).paths ?? {};

  it('documents every required hackathon route and method', () => {
    for (const { path, method } of REQUIRED_HACKATHON_OPERATIONS) {
      expect(paths[path]?.[method]).toBeDefined();
    }
  });

  it('documents the response statuses operators rely on for each route', () => {
    for (const { path, method, statuses } of REQUIRED_HACKATHON_OPERATIONS) {
      const operation = paths[path]?.[method];
      for (const status of statuses) {
        expect(operation?.responses?.[status]).toBeDefined();
      }
    }
  });

  it('documents a 2xx response for every operation currently in the spec', () => {
    for (const methods of Object.values(paths)) {
      for (const operation of Object.values(methods)) {
        const responseCodes = Object.keys((operation as { responses?: Record<string, unknown> }).responses ?? {});
        expect(responseCodes.some((code) => code.startsWith('2'))).toBe(true);
      }
    }
  });
});
