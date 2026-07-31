import { z } from "zod";
import { offsetPaginationSchema } from "./pagination.schema";

export const joinTournamentParamsSchema = z.object({
  id: z.string().min(1, "Tournament ID is required"),
});

export type JoinTournamentParams = z.infer<typeof joinTournamentParamsSchema>;

export const tournamentModeSchema = z.enum(["UP_DOWN", "LEGENDS"]);
export const tournamentStatusSchema = z.enum([
  "UPCOMING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

/**
 * Query params for GET /api/tournaments.
 * Supports mode and/or status filters with shared offset pagination.
 */
export const tournamentListQuerySchema = offsetPaginationSchema.extend({
  mode: tournamentModeSchema.optional(),
  status: tournamentStatusSchema.optional(),
});

export type TournamentListQuery = z.infer<typeof tournamentListQuerySchema>;
