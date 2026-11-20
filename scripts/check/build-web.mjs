#!/usr/bin/env node
/*
 * Build apps/web in JSON (fixture) mode and fail on content warnings.
 *
 * The build already exits non-zero on hard errors. What it did NOT catch was
 * the soft kind: a partner named in the home band that no partner record
 * matches, or a photo filename that resolves to nothing. Those degrade
 * silently -- the logo or portrait is simply dropped from the page -- and the
 * build stays green.
 *
 * That mattered because the fixture build used to print 40 such warnings of
 * its own, all expected. With a permanent noise floor that high, nobody reads
 * the list, and a real mismatch introduced by a content or code change looks
 * exactly like the status quo. The fixture is now self-consistent and the
 * expected-absence cases are silent by construction (see
 * lib/media-filename.ts `isFixtureMediaSentinel`), so the floor is zero and
 * any warning is real.
 *
 * Deliberately a warning gate on the FIXTURE build only. Production runs in
 * CMS mode, where the same conditions must keep degrading gracefully rather
 * than failing: an editor removing a partner must never break the deploy.
 *
 * It also reads the built CSS for scroll-driven animations the minifier has
 * broken. Vite 8 minifies with Lightning CSS, which folds
 * `animation: x linear both; animation-timeline: --t` into one shorthand,
 * `animation: linear both x --t`. Browsers do not accept a timeline inside
 * the shorthand, so they drop the whole declaration and the animation never
 * runs, on the live site only (dev serves the CSS unminified). Write such
 * animations as longhands (animation-name, -timing-function, -fill-mode,
 * -timeline), which Lightning CSS leaves alone. It also shortens a range
 * such as `entry 0% entry 100%` to the bare `entry`, which Safari did not
 * run (see bareTimelineRanges).
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT } from "../lib/paths.mjs";

/**
 * Build-time content warnings the fixture build must not produce.
 *
 * Matched ANYWHERE in the line, not as a prefix: Astro writes these while a
 * page line is still open, so they arrive appended to it
 * ("  ├─ /speaker/index.html[images] ..."). A startsWith check silently
 * matched nothing, which would have made this gate pass on any warning it was
 * built to catch.
 *
 * This list must cover EVERY tag apps/web can emit from a console.warn/info.
 * It shipped missing `[partner]` and `[whyq]`, so the gate printed
 * "0 content warnings" over a build that had just dropped nine partner logos.
 * scripts/check/scripts.test.mjs greps the source for emitted tags and fails
 * if any is not matched here, so the next new warn site cannot slip outside
 * the gate the same way.
 */
export const WARNING_TAG = /\[(index|images|partner|whyq|content(?::cms)?)\]/;

/**
 * `animation` shorthands in built CSS that carry a timeline (a dashed name
 * such as `--palace`, `view()` or `scroll()`): invalid in browsers, so
 * the animation silently does not run.
 */
export function timelineShorthands(css) {
  const found = [];
  for (const match of css.matchAll(/(?:^|[;{\s])animation:([^;}]*)/g)) {
    const value = match[1];
    if (/(?:^|[\s,])--[\w-]+|\b(?:view|scroll)\(/.test(value))
      found.push(`animation:${value.trim()}`);
  }
  return found;
}

/**
 * `animation-range` values in built CSS that are a bare range name
 * (`entry`, `entry, exit`). Lightning CSS shortens a range such as
 * `entry 0% entry 100%` to the bare `entry`; the spec allows it, but Safari
 * did not run it, and a held stage that never moved covered the live
 * homepage. It also rewrites other ranges (`contain 100% exit 100%` came
 * out as `contain 100% exit 0%`), so keep a range it must not touch in a
 * custom property (`animation-range: var(--range)`), whose value it
 * passes through as written.
 */
const RANGE_NAME = /^(cover|contain|entry|exit|entry-crossing|exit-crossing)$/;

export function bareTimelineRanges(css) {
  const found = [];
  for (const match of css.matchAll(/(?:^|[;{\s])animation-range:([^;}]*)/g)) {
    const value = match[1].trim();
    const bare = value.split(",").some((part) => RANGE_NAME.test(part.trim()));
    if (bare) found.push(`animation-range:${value}`);
  }
  return found;
}

function brokenTimelineAnimations() {
  const dir = path.join(REPO_ROOT, "apps", "web", "dist", "_astro");
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".css")) continue;
    const css = readFileSync(path.join(dir, name), "utf-8");
    for (const hit of [...timelineShorthands(css), ...bareTimelineRanges(css)])
      found.push(`${name}: ${hit}`);
  }
  return found;
}

function runFixtureBuildGate() {
  const child = spawn("pnpm", ["--filter", "web", "run", "build:fixture"], {
    cwd: REPO_ROOT,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const warnings = [];

  function scan(line) {
    const match = WARNING_TAG.exec(line);
    if (match) warnings.push(line.slice(match.index).trim());
  }

  /** Tee a stream to our own stdout/stderr while scanning it for warnings. */
  function watch(stream, sink) {
    let buffered = "";
    stream.setEncoding("utf-8");
    stream.on("data", (chunk) => {
      sink.write(chunk);
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) scan(line);
    });
    // Astro's final line often has no trailing newline, so it never leaves
    // `buffered` via the split above. Without this flush a warning emitted last
    // was silently dropped and the gate still printed "0 content warnings".
    stream.on("end", () => {
      if (buffered) {
        scan(buffered);
        buffered = "";
      }
    });
  }

  watch(child.stdout, process.stdout);
  watch(child.stderr, process.stderr);

  // 'close' rather than 'exit': 'exit' can fire before the stdio streams have
  // been fully read, which would race the flush above.
  child.on("close", (code) => {
    if (code !== 0) process.exit(code ?? 1);

    if (warnings.length > 0) {
      console.error(
        `\ncheck-build-web: the fixture build emitted ${warnings.length} content warning(s).\n` +
          "These are silent content mismatches: the affected logo, photo, or section is dropped\n" +
          "from the page and the build still succeeds. The fixture build is expected to be clean,\n" +
          "so each of these is a real mismatch to fix (or, if it is genuinely an expected absence,\n" +
          "mark it with the fixture sentinel in scripts/content/make-fixture.mjs).\n",
      );
      for (const warning of warnings) console.error(`  ${warning}`);
      process.exit(1);
    }

    const broken = brokenTimelineAnimations();
    if (broken.length > 0) {
      console.error(
        `\ncheck-build-web: ${broken.length} scroll-driven animation(s) were folded by the CSS\n` +
          "minifier into a form that does not run on the live site: a timeline inside the\n" +
          "animation shorthand (write longhands: animation-name, -timing-function, -fill-mode,\n" +
          "-timeline), or a bare range name in animation-range (write ranges whose start and\n" +
          "end lie in different named ranges, e.g. `entry 0% contain 0%`).\n",
      );
      for (const hit of broken) console.error(`  ${hit}`);
      process.exit(1);
    }

    console.log(
      "check-build-web: fixture build clean (0 content warnings, no broken timeline animations).",
    );
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) runFixtureBuildGate();
