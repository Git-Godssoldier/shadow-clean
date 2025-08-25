"use client";

import { useSession } from "@/lib/auth/auth-client";
import { createContext, ReactNode, useContext } from "react";

type Session = {
  user: {
    id: string;
    name?: string;
    email: string;
    image?: string | null;
  };
} | null;

type SessionContextType = {
  session: Session;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: isLoading } = useSession();

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useAuthSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within SessionProvider");
  }
  return context;
};
