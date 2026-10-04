import * as React from "react";

import { useChannelWorkingAgentPubkeys } from "@/features/agents/agentWorkingSignal";
import {
  buildCheckoutWorkCard,
  checkoutWorkFingerprint,
  checkoutWorkSource,
  type CheckoutWork,
  type CheckoutWorkCardModel,
} from "@/features/projects/lib/checkoutWork";
import type { Project, Repository } from "@/features/projects/projectModels";
import { useCheckoutWork } from "@/features/projects/useCheckoutWork";

type CheckoutWorkRailState = {
  error: string | null;
  isLoading: boolean;
  missingCheckout: boolean;
  work: CheckoutWork | null;
};

type CheckoutWorkContextValue = {
  card: CheckoutWorkCardModel | null;
  onOpenCommit?: (hash: string) => void;
  /** Null when this project has no checkout path Buzz already knows. */
  rail: CheckoutWorkRailState | null;
};

const CheckoutWorkContext =
  React.createContext<CheckoutWorkContextValue | null>(null);

export function useCheckoutWorkContext(): CheckoutWorkContextValue | null {
  return React.useContext(CheckoutWorkContext);
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error
    ? error.message
    : "Could not read the checkout.";
}

/**
 * Live checkout reads for the project chat.
 * A commit is linked on the card only when HEAD moves during a watched turn.
 */
export function CheckoutWorkProvider({
  channelId,
  children,
  onOpenCommit,
  project,
  repository,
}: {
  /** Chat whose working agents should refresh this checkout. */
  channelId?: string | null;
  children: React.ReactNode;
  onOpenCommit?: (hash: string) => void;
  project: Project;
  /** When set, checkout reads this repository instead of the primary. */
  repository?: Repository | null;
}) {
  const source = React.useMemo(
    () => checkoutWorkSource(project, repository),
    [project, repository],
  );
  const query = useCheckoutWork(source);
  const workingNow =
    useChannelWorkingAgentPubkeys(channelId ?? project.projectChannelId)
      .length > 0;
  const baselineRef = React.useRef<string | null>(null);
  const watchingRef = React.useRef(false);
  const wasWorkingRef = React.useRef(false);
  const [linkedHead, setLinkedHead] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      !workingNow ||
      !watchingRef.current ||
      baselineRef.current != null ||
      !query.data
    ) {
      return;
    }
    baselineRef.current = checkoutWorkFingerprint(query.data);
  }, [query.data, workingNow]);

  React.useEffect(() => {
    if (workingNow) {
      if (!wasWorkingRef.current) {
        wasWorkingRef.current = true;
        watchingRef.current = true;
        baselineRef.current = query.data
          ? checkoutWorkFingerprint(query.data)
          : null;
        setLinkedHead(null);
      }
      return;
    }
    if (!wasWorkingRef.current) return;
    wasWorkingRef.current = false;
    watchingRef.current = false;
    const before = baselineRef.current;
    void query.refetch().then((result) => {
      const data = result.data;
      if (!data) return;
      const next = checkoutWorkFingerprint(data);
      baselineRef.current = next;
      if (before == null || before === next) return;
      const beforeHead = before.split("\n")[0] ?? "";
      if (data.head && data.head !== beforeHead) setLinkedHead(data.head);
    });
  }, [query.data, query.refetch, workingNow]);

  const card =
    !workingNow && query.data
      ? buildCheckoutWorkCard(query.data, linkedHead)
      : null;
  const value = React.useMemo<CheckoutWorkContextValue>(
    () => ({
      card,
      onOpenCommit,
      rail: source
        ? {
            error: errorMessage(query.error),
            isLoading: query.isLoading,
            missingCheckout: query.isSuccess && query.data == null,
            work: query.data ?? null,
          }
        : null,
    }),
    [
      card,
      onOpenCommit,
      query.data,
      query.error,
      query.isLoading,
      query.isSuccess,
      source,
    ],
  );

  return (
    <CheckoutWorkContext.Provider value={value}>
      {children}
    </CheckoutWorkContext.Provider>
  );
}
