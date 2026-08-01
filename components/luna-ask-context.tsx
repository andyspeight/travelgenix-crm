"use client";

/**
 * One Ask Luna, two ways in.
 *
 * The assistant is a floating button and Cmd/Ctrl+K, mounted once for the
 * whole app. The dashboard now has a prompt line as well, and the temptation
 * with a second entry point is to build a second assistant — which is how two
 * things that answer questions end up answering them slightly differently.
 *
 * So this is a way to POINT AT the existing one: anything in the app can call
 * ask("who's travelling next month?") and the same panel opens with the same
 * history and the same tools. There is still exactly one Luna.
 *
 * The nonce is what makes asking the same question twice work — without it,
 * setting the identical question would not change the state and nothing would
 * happen the second time.
 */

import { createContext, useCallback, useContext, useState } from "react";
import { LunaAsk } from "@/components/luna-ask";

export type AskRequest = { question: string; nonce: number };

const LunaAskContext = createContext<{ ask: (question?: string) => void }>({
  ask: () => {},
});

export const useLunaAsk = () => useContext(LunaAskContext);

export function LunaAskProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<AskRequest | null>(null);

  const ask = useCallback((question = "") => {
    setRequest({ question, nonce: Date.now() });
  }, []);

  return (
    <LunaAskContext.Provider value={{ ask }}>
      {children}
      <LunaAsk request={request} />
    </LunaAskContext.Provider>
  );
}
