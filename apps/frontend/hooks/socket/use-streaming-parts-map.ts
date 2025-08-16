import { useCallback, useRef, useState } from "react";
import type { AssistantMessagePart } from "@repo/types";

/**
 * Manages a Map with both immediate access (ref) and React rendering (state).
 */
export function useStreamingPartsMap() {
  const mapRef = useRef<Map<string, AssistantMessagePart>>(new Map());
  const [map, setMap] = useState<Map<string, AssistantMessagePart>>(new Map());

  const updateMap = useCallback(
    (
      updater: (
        prev: Map<string, AssistantMessagePart>
      ) => Map<string, AssistantMessagePart>
    ) => {
      const newMap = updater(mapRef.current);
      mapRef.current = newMap;
      setMap(newMap);
      return newMap;
    },
    []
  );

  const clearMap = useCallback(() => {
    const newMap = new Map<string, AssistantMessagePart>();
    mapRef.current = newMap;
    setMap(newMap);
  }, []);

  return {
    map, // For rendering (React state)
    get current() { return mapRef.current; }, // Dynamic access - resolves fresh value each time!
    update: updateMap,
    clear: clearMap,
  };
}
