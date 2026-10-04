import {
  projectChannelPrimaryRepository,
  type ChannelCodebaseProject,
  type ChannelCodebaseRepository,
} from "@/features/projects/lib/channelCodebase";

/**
 * How a repositories-index row relates to the project it is already bound to.
 * Primary selection is `projectChannelPrimaryRepository`: Hula path, then the
 * repo bound to the home channel, then `primaryRepositoryAddress`.
 * A row is unlabeled when that helper cannot name a primary. Nothing is guessed.
 */
export type RepositoryRowRole =
  | { kind: "mainline" }
  | {
      kind: "subrepository";
      mainlineAddress: string;
      mainlineRepositoryId: string;
    }
  | { kind: "unlabeled" };

export type RepositoryRoleSource = {
  project: ChannelCodebaseProject;
  repository: Pick<ChannelCodebaseRepository, "id" | "repoAddress">;
};

export function repositoryRowRole(
  row: RepositoryRoleSource,
): RepositoryRowRole {
  const primary = projectChannelPrimaryRepository(row.project);
  if (!primary) return { kind: "unlabeled" };
  if (
    primary.id === row.repository.id ||
    primary.repoAddress === row.repository.repoAddress
  ) {
    return { kind: "mainline" };
  }
  const member = row.project.repositories.some(
    (repository) =>
      repository.id === row.repository.id ||
      repository.repoAddress === row.repository.repoAddress,
  );
  if (!member) return { kind: "unlabeled" };
  return {
    kind: "subrepository",
    mainlineAddress: primary.repoAddress,
    mainlineRepositoryId: primary.id,
  };
}

export function repositoryRowRoleLabel(
  role: RepositoryRowRole,
): "Mainline" | "Subrepository" | null {
  if (role.kind === "mainline") return "Mainline";
  if (role.kind === "subrepository") return "Subrepository";
  return null;
}

export type NestedRepositoryRow<T> = {
  nested: boolean;
  role: RepositoryRowRole;
  row: T;
};

/**
 * Keeps the incoming order for mainline and unlabeled rows.
 * A subrepository is drawn immediately after its mainline when that row is
 * in the list. A subrepository whose mainline is absent stays in place,
 * labeled, and not indented.
 */
export function nestRepositoryListRows<T extends RepositoryRoleSource>(
  rows: readonly T[],
): NestedRepositoryRow<T>[] {
  const roles = rows.map((row) => repositoryRowRole(row));
  const mainlineKeys = new Set<string>();
  rows.forEach((row, index) => {
    if (roles[index]?.kind !== "mainline") return;
    mainlineKeys.add(row.repository.repoAddress);
    mainlineKeys.add(row.repository.id);
  });

  const consumed = new Set<number>();
  const nested: NestedRepositoryRow<T>[] = [];
  const childrenOf = (address: string, id: string) =>
    rows.flatMap((row, index) => {
      const role = roles[index];
      if (role?.kind !== "subrepository") return [];
      if (
        role.mainlineAddress !== address &&
        role.mainlineRepositoryId !== id
      ) {
        return [];
      }
      return [{ index, role, row }];
    });

  rows.forEach((row, index) => {
    if (consumed.has(index)) return;
    const role = roles[index];
    if (!role) return;
    if (role.kind === "subrepository") {
      const parentPresent =
        mainlineKeys.has(role.mainlineAddress) ||
        mainlineKeys.has(role.mainlineRepositoryId);
      if (parentPresent) return;
      nested.push({ nested: false, role, row });
      return;
    }
    nested.push({ nested: false, role, row });
    if (role.kind !== "mainline") return;
    for (const child of childrenOf(
      row.repository.repoAddress,
      row.repository.id,
    )) {
      consumed.add(child.index);
      nested.push({ nested: true, role: child.role, row: child.row });
    }
  });
  return nested;
}

export type RepositoryOpenTarget =
  | { kind: "project-home"; projectId: string }
  | { kind: "repository-channel"; channelId: string };

/**
 * Mainline and unlabeled rows open the project home (Chat).
 * A subrepository opens the channel bound to that repo when it is a
 * different channel from the project home. Sharing the home channel, or
 * having no channel id, is not a subchannel: report the gap via
 * `missingSubchannel` and leave `target` null so callers do not fall back
 * to the parent project channel or the old Overview workspace.
 */
export function repositoryRowOpenTarget(input: {
  projectChannelId: string | null;
  projectId: string;
  repositoryChannelId?: string | null;
  role: RepositoryRowRole;
}): { missingSubchannel: boolean; target: RepositoryOpenTarget | null } {
  const home = { kind: "project-home" as const, projectId: input.projectId };
  if (input.role.kind !== "subrepository") {
    return { missingSubchannel: false, target: home };
  }
  const channelId = input.repositoryChannelId?.trim() ?? "";
  const homeId = input.projectChannelId?.trim() ?? "";
  if (channelId && channelId !== homeId) {
    return {
      missingSubchannel: false,
      target: { kind: "repository-channel", channelId },
    };
  }
  return { missingSubchannel: true, target: null };
}
