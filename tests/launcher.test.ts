import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporaryDirs: string[] = [];
const repoRoot = resolve(import.meta.dir, "..");

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// The shell launcher is for macOS. Windows CI still runs the generation tests.
describe.skipIf(process.platform === "win32")("standalone launcher", () => {
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), "video-gen-launcher-"));
    temporaryDirs.push(dir);
    const clone = join(dir, "nested", "clone with spaces");
    const bin = join(dir, "bin");
    const output = join(dir, "output folder");
    mkdirSync(join(clone, "build"), { recursive: true });
    mkdirSync(bin);
    mkdirSync(output);
    copyFileSync(join(repoRoot, "video-gen"), join(clone, "video-gen"));
    writeFileSync(join(dir, ".env"), "OPENROUTER_API_KEY=ancestor-key\n");
    writeFileSync(join(clone, ".env"), "OPENROUTER_API_KEY=clone-key\n");
    // Stand in for Bun so these tests never open a GUI or submit a paid job.
    writeFileSync(join(bin, "bun"), `#!/bin/sh
printf '%s\\n' "$PWD" "$FOLDER_PATH" "$TOOL_DIR" "$OPENROUTER_API_KEY" "$*"
`);
    chmodSync(join(bin, "bun"), 0o755);
    return { dir, clone, bin, output };
  }

  it("loads the clone's .env and keeps the output folder when launched through a symlink", () => {
    const { dir, clone, bin, output } = fixture();
    const link = join(bin, "video-gen");
    const symlink = Bun.spawnSync(["ln", "-s", join(clone, "video-gen"), link]);
    expect(symlink.exitCode).toBe(0);
    const result = Bun.spawnSync(["bash", link, output], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPENROUTER_API_KEY: "inherited-key" },
    });
    expect(result.exitCode).toBe(0);
    // realpath normalises /var to /private/var on macOS.
    const lines = result.stdout.toString().trim().split("\n");
    expect(lines[0]).toBe(lines[2]);
    expect(lines[0]).toContain("clone with spaces");
    expect(lines[1]).toContain("output folder");
    expect(lines.slice(3)).toEqual(["clone-key", "run dev"]);
  });

  it("rejects a missing output folder before invoking Bun", () => {
    const { clone, bin } = fixture();
    const result = Bun.spawnSync(["bash", join(clone, "video-gen"), join(clone, "missing")], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("not a folder");
    expect(result.stdout.toString()).toBe("");
  });

  it("installs only video-gen and can be rerun from another directory", () => {
    const { dir, clone, bin } = fixture();
    copyFileSync(join(repoRoot, "install.sh"), join(clone, "install.sh"));
    const target = join(dir, "custom bin");
    const otherTool = join(target, "other-tool");
    mkdirSync(target);
    writeFileSync(otherTool, "keep me");
    for (let run = 0; run < 2; run++) {
      const result = Bun.spawnSync(["bash", join(clone, "install.sh"), target, "--with-bun-install"], {
        cwd: dir,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPENROUTER_API_KEY: "" },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("install");
    }
    expect(readFileSync(otherTool, "utf8")).toBe("keep me");
    const result = Bun.spawnSync([join(target, "video-gen"), dir], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("clone-key");
  });
});
