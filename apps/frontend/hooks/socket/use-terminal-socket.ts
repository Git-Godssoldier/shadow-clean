"use client";

import { useSocket } from "./use-socket";
import { useEffect, useState, useCallback } from "react";
import type { TerminalEntry } from "@repo/types";

export function useTerminalSocket(taskId: string | undefined) {
  const { socket, isConnected } = useSocket();
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [isTerminalConnected, setIsTerminalConnected] = useState(false);

  // Join task room and request terminal history
  useEffect(() => {
    if (socket && taskId && isConnected) {
      socket.emit('join-task', { taskId });
      socket.emit('get-terminal-history', { taskId });
    }
  }, [socket, taskId, isConnected]);

  // Terminal event handlers with enhanced functionality from main branch
  useEffect(() => {
    if (!socket || !taskId) return;


    const handleTerminalHistory = (data: { taskId: string; entries: TerminalEntry[] }) => {
      if (data.taskId !== taskId) return;

      setTerminalEntries(data.entries);
      setIsTerminalConnected(true);
    };

    const handleTerminalOutput = (data: { taskId: string; entry: TerminalEntry }) => {
      if (data.taskId !== taskId) return;

      setTerminalEntries(prev => [...prev, data.entry]);
    };

    const handleTerminalCleared = (data: { taskId: string }) => {
      if (data.taskId !== taskId) return;

      setTerminalEntries([]);
    };

    const handleTerminalHistoryError = (data: { error: string }) => {
      console.error("[TERMINAL] History error:", data.error);
      setIsTerminalConnected(false);
    };

    const handleTerminalError = (data: { error: string }) => {
      console.error("[TERMINAL] Terminal error:", data.error);
      setIsTerminalConnected(false);
    };

    const handleConnect = () => {
      setIsTerminalConnected(true);
      // Re-request terminal history on reconnect
      if (taskId) {
        socket.emit('get-terminal-history', { taskId });
      }
    };

    const handleDisconnect = () => {
      setIsTerminalConnected(false);
    };

    // Register event listeners
    socket.on('terminal-history', handleTerminalHistory);
    socket.on('terminal-output', handleTerminalOutput);
    socket.on('terminal-cleared', handleTerminalCleared);
    socket.on('terminal-history-error', handleTerminalHistoryError);
    socket.on('terminal-error', handleTerminalError);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Set initial connection status
    setIsTerminalConnected(socket.connected);

    return () => {
      socket.off('terminal-history', handleTerminalHistory);
      socket.off('terminal-output', handleTerminalOutput);
      socket.off('terminal-cleared', handleTerminalCleared);
      socket.off('terminal-history-error', handleTerminalHistoryError);
      socket.off('terminal-error', handleTerminalError);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, taskId]);

  const clearTerminal = useCallback(() => {
    if (socket && taskId) {
      socket.emit('clear-terminal', { taskId });
    }
  }, [socket, taskId]);

  return {
    terminalEntries,
    isTerminalConnected: isTerminalConnected && isConnected,
    clearTerminal,
  };
}