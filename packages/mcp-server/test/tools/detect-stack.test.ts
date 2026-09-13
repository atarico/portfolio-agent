import { describe, expect, it } from "vitest";

import { detectStack } from "../../src/tools/detect-stack.ts";
import { FakeGitHub } from "../fake-github.ts";

const nextAppPackageJson = JSON.stringify({
  name: "kinesio",
  packageManager: "pnpm@10.0.0",
  dependencies: {
    next: "16.1.6",
    react: "19.2.3",
    "react-dom": "19.2.3",
    "@supabase/supabase-js": "^2.97.0",
    zustand: "^5.0.12",
  },
  devDependencies: {
    tailwindcss: "^4",
    typescript: "^5",
    vitest: "^3",
  },
});

const github = new FakeGitHub({
  files: {
    "octocat/next-app/package.json": nextAppPackageJson,
    "octocat/no-pm-field/package.json": JSON.stringify({ dependencies: { astro: "^6" } }),
    "octocat/no-pm-field/pnpm-lock.yaml": "lockfileVersion: 9",
    "octocat/broken/package.json": "{ not json",
    "octocat/py-api/pyproject.toml": '[project]\ndependencies = ["fastapi>=0.100", "sqlalchemy"]\n',
    "octocat/go-svc/go.mod": "module example.com/svc\n\nrequire github.com/gin-gonic/gin v1.9.0\n",
  },
});

describe("detectStack", () => {
  it("detects a Node project with its frameworks, notable libraries and package manager", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "next-app" });

    expect(result.runtime).toBe("node");
    expect(result.frameworks).toEqual(["Next.js", "React"]);
    expect(result.notable).toEqual(
      expect.arrayContaining(["Supabase", "Zustand", "Tailwind CSS", "TypeScript", "Vitest"]),
    );
    expect(result.packageManager).toBe("pnpm");
    expect(result.dependencies).toContain("next");
    expect(result.devDependencies).toContain("tailwindcss");
    expect(result.detectedFrom).toEqual(["package.json"]);
  });

  it("falls back to lockfiles when package.json has no packageManager field", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "no-pm-field" });

    expect(result.frameworks).toEqual(["Astro"]);
    expect(result.packageManager).toBe("pnpm");
    expect(result.detectedFrom).toEqual(["package.json", "pnpm-lock.yaml"]);
  });

  it("does not throw on a malformed package.json", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "broken" });

    expect(result.runtime).toBe("node");
    expect(result.frameworks).toEqual([]);
    expect(result.notes).toContain("package.json could not be parsed");
  });

  it("detects a Python project from pyproject.toml", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "py-api" });

    expect(result.runtime).toBe("python");
    expect(result.frameworks).toEqual(["FastAPI"]);
    expect(result.detectedFrom).toEqual(["pyproject.toml"]);
  });

  it("detects a Go project from go.mod", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "go-svc" });

    expect(result.runtime).toBe("go");
    expect(result.frameworks).toEqual(["Gin"]);
  });

  it("reports unknown when no manifest is found", async () => {
    const result = await detectStack(github, { owner: "octocat", repo: "empty" });

    expect(result.runtime).toBe("unknown");
    expect(result.frameworks).toEqual([]);
    expect(result.detectedFrom).toEqual([]);
    expect(result.notes).toContain("No package.json, pyproject.toml or go.mod found");
  });
});

describe("detectStack lockfile probing", () => {
  it("probes lockfiles in priority order and stops at the first hit", async () => {
    const isolated = new FakeGitHub({
      files: {
        "octocat/two-locks/package.json": JSON.stringify({ dependencies: {} }),
        "octocat/two-locks/yarn.lock": "# yarn",
        "octocat/two-locks/package-lock.json": "{}",
      },
    });

    const result = await detectStack(isolated, { owner: "octocat", repo: "two-locks" });

    expect(result.packageManager).toBe("yarn");
    expect(result.detectedFrom).toEqual(["package.json", "yarn.lock"]);
    expect(isolated.calls).not.toContain("getFile:octocat/two-locks/package-lock.json");
  });
});
