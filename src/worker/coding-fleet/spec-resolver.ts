export type OpenSpecResolutionErrorCode =
  | "change_not_found"
  | "invalid_proposal"
  | "spec_not_found"
  | "source_unavailable";

export class OpenSpecResolutionError extends Error {
  constructor(
    readonly code: OpenSpecResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OpenSpecResolutionError";
  }
}

interface GitTreeEntry {
  path: string;
  type: string;
}

interface GitTreeResponse {
  tree: GitTreeEntry[];
  truncated?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGitTree(value: unknown): GitTreeResponse {
  if (!isRecord(value) || !Array.isArray(value.tree)) {
    throw new OpenSpecResolutionError(
      "source_unavailable",
      "GitHub returned an invalid repository tree response.",
    );
  }

  const entries: GitTreeEntry[] = [];
  for (const entry of value.tree) {
    if (
      !isRecord(entry)
      || typeof entry.path !== "string"
      || typeof entry.type !== "string"
    ) {
      throw new OpenSpecResolutionError(
        "source_unavailable",
        "GitHub returned an invalid repository tree entry.",
      );
    }
    entries.push({ path: entry.path, type: entry.type });
  }

  return {
    tree: entries,
    truncated: value.truncated === true,
  };
}

function decodeGitHubContent(value: unknown): string {
  if (
    !isRecord(value)
    || value.type !== "file"
    || value.encoding !== "base64"
    || typeof value.content !== "string"
  ) {
    throw new OpenSpecResolutionError(
      "invalid_proposal",
      "The OpenSpec proposal is not a readable file.",
    );
  }

  const decoded = atob(value.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function capabilitySpecPaths(proposal: string): string[] {
  const heading = "## Capabilities";
  const start = proposal.indexOf(heading);
  if (start < 0) {
    throw new OpenSpecResolutionError(
      "invalid_proposal",
      "The OpenSpec proposal has no Capabilities section.",
    );
  }
  const sectionStart = start + heading.length;
  const impactHeading = proposal.indexOf("\n## Impact", sectionStart);
  const section = proposal.slice(
    sectionStart,
    impactHeading < 0 ? proposal.length : impactHeading,
  );

  const entries = [...section.matchAll(/^- `([^`]+)`:\s*.+$/gm)]
    .map((match) => match[1])
    .filter((path) => path !== undefined && !path.startsWith("<"));

  if (entries.length === 0) {
    throw new OpenSpecResolutionError(
      "invalid_proposal",
      "The OpenSpec proposal does not declare any capabilities.",
    );
  }

  const paths = entries.map((capability) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(capability)) {
      throw new OpenSpecResolutionError(
        "invalid_proposal",
        `The proposal contains an invalid capability path: ${capability}`,
      );
    }
    return `specs/${capability}/spec.md`;
  });

  return [...new Set(paths)];
}

export async function resolveOpenSpecArtifacts(
  repository: string,
  branch: string,
  changeName: string,
  token?: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const [owner, repo] = repository.split("/");
  if (
    owner === undefined
    || repo === undefined
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(changeName)
    || branch.trim().length === 0
  ) {
    throw new OpenSpecResolutionError(
      "invalid_proposal",
      "The repository, branch, or OpenSpec change name is invalid.",
    );
  }

  const headers = new Headers({
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "CommunityMesh-CodingFleet",
  });
  if (token !== undefined && token.trim().length > 0) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const repositoryApi = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const treeUrl = new URL(`${repositoryApi}/git/trees/${encodeURIComponent(branch)}`);
  treeUrl.searchParams.set("recursive", "1");
  const treeResponse = await fetcher(treeUrl, { headers });
  if (!treeResponse.ok) {
    if (treeResponse.status === 404) {
      throw new OpenSpecResolutionError(
        "change_not_found",
        `Repository ${repository} or branch ${branch} was not found.`,
      );
    }
    throw new OpenSpecResolutionError(
      "source_unavailable",
      `GitHub repository tree request failed with status ${treeResponse.status}.`,
    );
  }

  const tree = parseGitTree(await treeResponse.json());
  if (tree.truncated) {
    throw new OpenSpecResolutionError(
      "source_unavailable",
      "GitHub truncated the repository tree; spec paths could not be resolved safely.",
    );
  }

  const changeRoot = `openspec/changes/${changeName}`;
  const proposalPath = `${changeRoot}/proposal.md`;
  const treePaths = new Set(tree.tree.filter(({ type }) => type === "blob").map(({ path }) => path));
  if (!treePaths.has(proposalPath)) {
    throw new OpenSpecResolutionError(
      "change_not_found",
      `OpenSpec change ${changeName} has no proposal at the requested branch.`,
    );
  }

  const proposalUrl = new URL(
    `${repositoryApi}/contents/${proposalPath.split("/").map(encodeURIComponent).join("/")}`,
  );
  proposalUrl.searchParams.set("ref", branch);
  const proposalResponse = await fetcher(proposalUrl, { headers });
  if (!proposalResponse.ok) {
    throw new OpenSpecResolutionError(
      proposalResponse.status === 404 ? "change_not_found" : "source_unavailable",
      `OpenSpec proposal request failed with status ${proposalResponse.status}.`,
    );
  }

  const proposal = decodeGitHubContent(await proposalResponse.json());
  const requiredPaths = [
    "proposal.md",
    "design.md",
    "tasks.md",
    ...capabilitySpecPaths(proposal),
  ];
  const missing = requiredPaths.filter((path) => !treePaths.has(`${changeRoot}/${path}`));
  if (missing.length > 0) {
    throw new OpenSpecResolutionError(
      missing.some((path) => path.startsWith("specs/"))
        ? "spec_not_found"
        : "change_not_found",
      `OpenSpec change ${changeName} is missing required artifacts: ${missing.join(", ")}.`,
    );
  }

  return requiredPaths.map((path) => `${changeRoot}/${path}`);
}
