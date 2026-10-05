import * as React from "react";

import { useChannelWorkingAgentPubkeys } from "@/features/agents/agentWorkingSignal";
import {
  buildCheckoutWorkCard,
  checkoutWorkFingerprint,
  checkoutWorkSource,
  pickDefaultCheckoutSelection,
  type CheckoutFilesBrowseTarget,
  type CheckoutPullRequest,
  type CheckoutRailCatalog,
  type CheckoutRailSelection,
  type CheckoutSelectionDetail,
  type CheckoutWorkCardModel,
} from "@/features/projects/lib/checkoutWork";
import {
  projectChannelPrimaryRepository,
  resolveCodebaseOrigin,
  storedRepositoryRemotes,
} from "@/features/projects/lib/channelCodebase";
import { useRepoPullRequests } from "@/features/projects/lib/checkoutPullRequests";
import type { Project, Repository } from "@/features/projects/projectModels";
import {
  useCheckoutRailCatalog,
  useCheckoutSelectionDetail,
  useCheckoutWork,
} from "@/features/projects/useCheckoutWork";

type CheckoutWorkRailState = {
  catalog: CheckoutRailCatalog | null;
  detail: CheckoutSelectionDetail | null;
  error: string | null;
  isLoading: boolean;
  missingCheckout: boolean;
  pullRequests: CheckoutPullRequest[];
  selectedId: string | null;
  selection: CheckoutRailSelection | null;
  setSelectedId: (id: string) => void;
};

type CheckoutWorkContextValue = {
  card: CheckoutWorkCardModel | null;
  onOpenCommit?: (hash: string) => void;
  onOpenFiles?: (target: CheckoutFilesBrowseTarget) => void;
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
  onOpenFiles,
  project,
  repository,
}: {
  /** Chat whose working agents should refresh this checkout. */
  channelId?: string | null;
  children: React.ReactNode;
  onOpenCommit?: (hash: string) => void;
  onOpenFiles?: (target: CheckoutFilesBrowseTarget) => void;
  project: Project;
  /** When set, checkout reads this repository instead of the primary. */
  repository?: Repository | null;
}) {
  const source = React.useMemo(
    () => checkoutWorkSource(project, repository),
    [project, repository],
  );
  const defaultBranchHint =
    repository?.defaultBranch ??
    project.repositories.find((entry) => entry.hulaPath)?.defaultBranch ??
    project.repositories[0]?.defaultBranch ??
    null;
  const query = useCheckoutWork(source);
  const catalogQuery = useCheckoutRailCatalog(source, defaultBranchHint);
  const githubRepo = React.useMemo(() => {
    const target =
      repository ?? projectChannelPrimaryRepository(project) ?? null;
    const origin = resolveCodebaseOrigin(null, storedRepositoryRemotes(target));
    return origin.kind === "github" ? `${origin.owner}/${origin.repo}` : null;
  }, [project, repository]);
  const pullRequestsQuery = useRepoPullRequests(githubRepo);
  const pullRequests = pullRequestsQuery.data ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const workingNow =
    useChannelWorkingAgentPubkeys(channelId ?? project.projectChannelId)
      .length > 0;
  const baselineRef = React.useRef<string | null>(null);
  const watchingRef = React.useRef(false);
  const wasWorkingRef = React.useRef(false);
  const [linkedHead, setLinkedHead] = React.useState<string | null>(null);

  const catalog = catalogQuery.data ?? null;

  React.useEffect(() => {
    if (!catalog || catalog.selections.length === 0) return;
    const ids = new Set(catalog.selections.map((entry) => entry.id));
    if (selectedId && ids.has(selectedId)) return;
    setSelectedId(pickDefaultCheckoutSelection(catalog));
  }, [catalog, selectedId]);

  const detailQuery = useCheckoutSelectionDetail(source, catalog, selectedId);

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
    void catalogQuery.refetch();
    void detailQuery.refetch();
  }, [
    catalogQuery.refetch,
    detailQuery.refetch,
    query.data,
    query.refetch,
    workingNow,
  ]);

  const selection =
    catalog?.selections.find((entry) => entry.id === selectedId) ?? null;

  const card =
    !workingNow && query.data
      ? buildCheckoutWorkCard(query.data, linkedHead)
      : null;
  const value = React.useMemo<CheckoutWorkContextValue>(
    () => ({
      card,
      onOpenCommit,
      onOpenFiles,
      rail: source
        ? {
            catalog,
            detail: detailQuery.data ?? null,
            error:
              errorMessage(catalogQuery.error) ??
              errorMessage(detailQuery.error) ??
              errorMessage(query.error),
            isLoading:
              catalogQuery.isLoading ||
              (Boolean(selectedId) && detailQuery.isLoading),
            missingCheckout:
              (catalogQuery.isSuccess || query.isSuccess) &&
              catalog == null &&
              query.data == null,
            pullRequests,
            selectedId,
            selection,
            setSelectedId,
          }
        : null,
    }),
    [
      card,
      catalog,
      catalogQuery.error,
      catalogQuery.isLoading,
      catalogQuery.isSuccess,
      detailQuery.data,
      detailQuery.error,
      detailQuery.isLoading,
      onOpenCommit,
      onOpenFiles,
      pullRequests,
      query.data,
      query.error,
      query.isSuccess,
      selectedId,
      selection,
      source,
    ],
  );

  return (
    <CheckoutWorkContext.Provider value={value}>
      {children}
    </CheckoutWorkContext.Provider>
  );
}
