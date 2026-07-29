# 🔌 Socket.IO Client Contract Documentation

This document defines the real-time event contract, lifecycle events, and type structures for the Xelma Backend gateway (`src/socket.ts`). It is designed to allow any contributor or frontend engineer to fully integrate real-time tracking without needing to dig into the source code.

---

## 🧭 Connection Lifecycle & Authentication

### 1. Connection Requirements
Connections are established using the standard Socket.IO client library against the root namespace (`/`). Authentication requires a valid JSON Web Token (JWT) provided in the initial handshake payload.

* **Production Gateway URL:** `https://api.tevalabs.com`
* **Protocol:** WebSocket / Polling fallback

```typescript
import { io } from "socket.io-client";

const socket = io("https://api.tevalabs.com", {
  auth: {
    token: "YOUR_JWT_ACCESS_TOKEN"
  },
  autoConnect: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
```

Join the `round` room after connect (via your client's room-join handshake) to receive round and bet broadcasts.

---

## Server → Client events

| Event | Room(s) | When |
| --- | --- | --- |
| `round:started` / `round_update` | `round`, `round:{id}` | Round lifecycle |
| `prediction:placed` | `round` | Legacy prediction placement |
| `bet:accepted` | `round`, `round:{id}` (when `roundId` known) | Successful stub or on-chain bet |
| `price:update` / `price_update` | `round`, active `round:{id}` | Oracle price ticks |
| `round:resolved` | `round` | Round resolution |
| `chat:message` | `chat` | Chat |
| `notification:new` | `user:{userId}` | User notification |

### `bet:accepted` (Issue #376)

Emitted **once** after `BetService` successfully records a stub bet or places an on-chain bet. Never emitted when Soroban / validation fails.

```typescript
socket.on("bet:accepted", (payload: {
  roundId?: string;
  address: string;
  amount: number;
  side?: "UP" | "DOWN";      // UP_DOWN only
  mode: "UP_DOWN" | "PRECISION";
  state: string;             // e.g. "stub" | "on-chain-success"
  txHash?: string;           // present for on-chain placements
}) => {
  // Update live pools / activity feed
});
```

Both the hackathon entrypoint (`initWebSocket` in `src/server.ts`) and the full backend (`initializeSocket` in `src/index.ts`) publish through `websocketService`, so clients see the same event regardless of which process is running.
