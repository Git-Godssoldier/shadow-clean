"use client";

import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@repo/types";

const RECONNECTION_DELAY = 1000;
const RECONNECTION_DELAY_MAX = 5000;
const RECONNECTION_ATTEMPTS = 5;
const SOCKET_TIMEOUT = Number(process.env.NEXT_PUBLIC_SOCKET_TIMEOUT_MS || "") || 60000;

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export const socket: TypedSocket = io(socketUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: RECONNECTION_ATTEMPTS,
  reconnectionDelay: RECONNECTION_DELAY,
  reconnectionDelayMax: RECONNECTION_DELAY_MAX,
  timeout: SOCKET_TIMEOUT,
  forceNew: false,
  withCredentials: true,
});
