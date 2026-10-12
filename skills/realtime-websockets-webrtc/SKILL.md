---
name: realtime-websockets-webrtc
description: Architect and implement low-latency real-time applications using WebSockets, Socket.IO, WebRTC, and Server-Sent Events
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Real-Time WebSockets & WebRTC Mastery Skill

## Core Philosophy: Millisecond Latency & Rock-Solid Fault Tolerance
Real-time features (live collaborative editing, chat, multiplayer state sync, live dashboards, video/audio calls) must feel instantaneous (<50ms local feedback), self-heal on network drops, and never corrupt distributed client state.

---

## 1. Zero-Stub & Architecture Mandate
- **NEVER create real-time handlers without reconnection and error handling logic.**
- **Full Architecture Requirements**:
  1. **Connection Lifecycle Management**: Handle connecting, connected, reconnecting (exponential backoff with jitter), disconnected, and error states gracefully with UI status indicators.
  2. **Heartbeats & Ping-Pong**: Implement keep-alive pings to detect half-open sockets and firewalls dropping silent connections.
  3. **Room & Namespace Isolation**: Proper channel/room join and leave events, preventing state bleed between distinct user sessions.
  4. **Optimistic Updates & Sequence Numbering**: Immediately update local UI, assign client-side temporary IDs, and reconcile with server ACKs or rollback on timeout.
  5. **State Synchronization**:
     - Ephemeral data (cursors, presence, typing indicators): Send throttled/debounced UDP-style broadcasts.
     - Persistent data (messages, documents): Store in database before broadcast, use message IDs and monotonic sequence numbers to guarantee order.
  6. **Scale-Out Architecture**: For multi-node backend clusters, back WebSocket servers with Redis Pub/Sub (`@socket.io/redis-adapter` or custom Redis streams) so messages broadcast across all instances.

---

## 2. Implementation Patterns

### WebSockets (Node.js / ws or Socket.IO)
```typescript
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

export function initializeRealtimeGateway(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId || socket.id;
    socket.join(`user:${userId}`);

    socket.on('room:join', (roomId: string) => {
      socket.join(roomId);
      socket.to(roomId).emit('presence:joined', { userId, timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      // Clean up presence across all rooms
    });
  });

  return io;
}
```

### WebRTC (Peer-to-Peer & Media Streaming)
- Signaling Server: WebSockets/SSE to exchange SDP offers, answers, and ICE candidates.
- STUN/TURN: Always configure fallback Google STUN servers (`stun:stun.l.google.com:19302`) and TURN relays for NAT traversal.
- Track negotiation: Handle `onnegotiationneeded`, `ontrack`, `onicecandidate`, and track cleanup when calls end.

---

## 3. Production Verification Checklist
1. Reconnection Resilience: Disconnecting network and reconnecting re-establishes connection and syncs missing state.
2. Memory Leaks: Verify socket event listeners are removed on component unmount (`socket.off(...)`).
3. Payload Validation: Incoming messages validated with Zod before processing.
