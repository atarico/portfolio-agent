import type { GitHubPort } from "../ports/github.ts";

export interface DetectStackInput {
  owner: string;
  repo: string;
}

export type Runtime = "node" | "python" | "go" | "unknown";

export type StackReport = {
  owner: string;
  repo: string;
  runtime: Runtime;
  /** Application frameworks, most specific first (e.g. "Next.js" before "React"). */
  frameworks: string[];
  /** Notable libraries and tooling worth mentioning (ORMs, CSS, testing, AI SDKs...). */
  notable: string[];
  packageManager: string | null;
  dependencies: string[];
  devDependencies: string[];
  /** Manifest files that were actually read to build this report. */
  detectedFrom: string[];
  /** Per-package findings for monorepos (empty when not a monorepo or no workspace manifests were found). */
  workspaces: WorkspaceReport[];
  notes: string[];
};

export interface WorkspaceReport {
  /** Directory of the workspace package, e.g. `apps/web`. */
  path: string;
  frameworks: string[];
  notable: string[];
}

/** Ordered so that meta-frameworks are listed before the libraries they wrap. */
const NODE_FRAMEWORKS: ReadonlyArray<readonly [dependency: string, label: string]> = [
  ["next", "Next.js"],
  ["astro", "Astro"],
  ["nuxt", "Nuxt"],
  ["@sveltejs/kit", "SvelteKit"],
  ["@remix-run/react", "Remix"],
  ["@angular/core", "Angular"],
  ["expo", "Expo"],
  ["react-native", "React Native"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["solid-js", "Solid"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["hono", "Hono"],
  ["fastify", "Fastify"],
  ["electron", "Electron"],
];

const NODE_NOTABLE: ReadonlyArray<readonly [dependency: string, label: string]> = [
  ["typescript", "TypeScript"],
  ["tailwindcss", "Tailwind CSS"],
  ["@supabase/supabase-js", "Supabase"],
  ["firebase", "Firebase"],
  ["prisma", "Prisma"],
  ["@prisma/client", "Prisma"],
  ["drizzle-orm", "Drizzle"],
  ["zustand", "Zustand"],
  ["@tanstack/react-query", "TanStack Query"],
  ["zod", "Zod"],
  ["ai", "Vercel AI SDK"],
  ["@modelcontextprotocol/server", "MCP SDK"],
  ["@modelcontextprotocol/sdk", "MCP SDK"],
  ["vite", "Vite"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["@playwright/test", "Playwright"],
  ["dexie", "Dexie"],
];

const PYTHON_FRAMEWORKS: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/\bfastapi\b/i, "FastAPI"],
  [/\bdjango\b/i, "Django"],
  [/\bflask\b/i, "Flask"],
];

const GO_FRAMEWORKS: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/gin-gonic\/gin/, "Gin"],
  [/labstack\/echo/, "Echo"],
  [/gofiber\/fiber/, "Fiber"],
  [/go-chi\/chi/, "Chi"],
];

const LOCKFILES: ReadonlyArray<readonly [file: string, manager: string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
  ["bun.lock", "bun"],
];

/** Workspace manifests read per repository; bounds the extra GitHub calls (60/hour unauthenticated). */
export const MAX_WORKSPACE_MANIFESTS = 8;

/** `apps/web/package.json` has 3 segments; deeper manifests are fixtures or vendored code, not workspaces. */
const MAX_MANIFEST_PATH_SEGMENTS = 4;

interface PackageJson {
  packageManager?: string;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function detectStack(
  github: GitHubPort,
  { owner, repo }: DetectStackInput,
): Promise<StackReport> {
  const report: StackReport = {
    owner,
    repo,
    runtime: "unknown",
    frameworks: [],
    notable: [],
    packageManager: null,
    dependencies: [],
    devDependencies: [],
    detectedFrom: [],
    workspaces: [],
    notes: [],
  };

  const packageJson = await github.getFile(owner, repo, "package.json");
  if (packageJson !== null) {
    await describeNodeProject(github, packageJson, report);
    return report;
  }

  const pyproject = await github.getFile(owner, repo, "pyproject.toml");
  if (pyproject !== null) {
    report.runtime = "python";
    report.detectedFrom.push("pyproject.toml");
    report.frameworks = matchLabels(PYTHON_FRAMEWORKS, pyproject);
    return report;
  }

  const goMod = await github.getFile(owner, repo, "go.mod");
  if (goMod !== null) {
    report.runtime = "go";
    report.detectedFrom.push("go.mod");
    report.frameworks = matchLabels(GO_FRAMEWORKS, goMod);
    return report;
  }

  report.notes.push("No package.json, pyproject.toml or go.mod found");
  return report;
}

async function describeNodeProject(
  github: GitHubPort,
  packageJsonSource: string,
  report: StackReport,
): Promise<void> {
  report.runtime = "node";
  report.detectedFrom.push("package.json");

  const parsed = parsePackageJson(packageJsonSource);
  if (parsed === null) {
    report.notes.push("package.json could not be parsed");
    return;
  }

  const rootDependencies = Object.keys(parsed.dependencies ?? {});
  const rootDevDependencies = Object.keys(parsed.devDependencies ?? {});
  const rootInstalled = new Set([...rootDependencies, ...rootDevDependencies]);

  const dependencies = new Set(rootDependencies);
  const devDependencies = new Set(rootDevDependencies);
  const installed = new Set(rootInstalled);

  // Workspace roots usually hold no runtime dependencies of their own, so
  // reading only the root manifest would report "no frameworks".
  if (parsed.workspaces !== undefined || rootDependencies.length === 0) {
    const manifests = await readWorkspaceManifests(github, report);
    for (const { path, manifest } of manifests) {
      const workspaceDeps = Object.keys(manifest.dependencies ?? {});
      const workspaceDevDeps = Object.keys(manifest.devDependencies ?? {});
      workspaceDeps.forEach((name) => dependencies.add(name));
      workspaceDevDeps.forEach((name) => devDependencies.add(name));
      const own = new Set([...workspaceDeps, ...workspaceDevDeps]);
      own.forEach((name) => installed.add(name));
      report.workspaces.push({
        path: path.slice(0, -"/package.json".length),
        frameworks: pickLabels(NODE_FRAMEWORKS, own),
        notable: pickLabels(NODE_NOTABLE, own),
      });
    }
  }

  report.dependencies = [...dependencies];
  report.devDependencies = [...devDependencies];
  report.frameworks = pickLabels(NODE_FRAMEWORKS, installed);
  report.notable = pickLabels(NODE_NOTABLE, installed);

  const declared = parsePackageManagerField(parsed.packageManager);
  if (declared !== null) {
    report.packageManager = declared;
    return;
  }

  const probe = await probeLockfiles(github, report.owner, report.repo);
  report.packageManager = probe.packageManager;
  report.detectedFrom.push(...probe.detectedFrom);
}

interface WorkspaceManifest {
  path: string;
  manifest: PackageJson;
}

/** Workspace manifests in the repository, shallowest first, capped at {@link MAX_WORKSPACE_MANIFESTS}. */
function selectWorkspaceManifestPaths(files: readonly string[]): string[] {
  const depth = (path: string) => path.split("/").length;
  return files
    .filter(
      (path) =>
        path.endsWith("/package.json") &&
        !path.includes("node_modules/") &&
        depth(path) <= MAX_MANIFEST_PATH_SEGMENTS,
    )
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, MAX_WORKSPACE_MANIFESTS);
}

/** Fetches and parses workspace manifests in parallel; unparsable ones are skipped with a note. */
async function readWorkspaceManifests(github: GitHubPort, report: StackReport): Promise<WorkspaceManifest[]> {
  const paths = selectWorkspaceManifestPaths(await github.listFiles(report.owner, report.repo));
  const sources = await Promise.all(paths.map((path) => github.getFile(report.owner, report.repo, path)));

  const manifests: WorkspaceManifest[] = [];
  paths.forEach((path, index) => {
    const source = sources[index];
    if (source === null || source === undefined) return;
    const manifest = parsePackageJson(source);
    if (manifest === null) {
      report.notes.push(`${path} could not be parsed`);
      return;
    }
    report.detectedFrom.push(path);
    manifests.push({ path, manifest });
  });
  return manifests;
}

function parsePackageJson(source: string): PackageJson | null {
  try {
    const value: unknown = JSON.parse(source);
    return typeof value === "object" && value !== null ? (value as PackageJson) : null;
  } catch {
    return null;
  }
}

function parsePackageManagerField(field: string | undefined): string | null {
  if (!field) return null;
  const name = field.split("@")[0];
  return name ? name : null;
}

interface LockfileProbe {
  packageManager: string | null;
  /** Lockfiles that were read to reach the verdict (at most one: the first hit). */
  detectedFrom: string[];
}

/** Pure lookup: checks lockfiles in priority order and stops at the first one found. */
async function probeLockfiles(github: GitHubPort, owner: string, repo: string): Promise<LockfileProbe> {
  for (const [file, manager] of LOCKFILES) {
    const content = await github.getFile(owner, repo, file);
    if (content !== null) {
      return { packageManager: manager, detectedFrom: [file] };
    }
  }
  return { packageManager: null, detectedFrom: [] };
}

function pickLabels(
  catalog: ReadonlyArray<readonly [dependency: string, label: string]>,
  installed: ReadonlySet<string>,
): string[] {
  const labels: string[] = [];
  for (const [dependency, label] of catalog) {
    if (installed.has(dependency) && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function matchLabels(
  catalog: ReadonlyArray<readonly [pattern: RegExp, label: string]>,
  source: string,
): string[] {
  return catalog.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
}
