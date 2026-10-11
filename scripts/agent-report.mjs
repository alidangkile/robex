#!/usr/bin/env node
import { execSync } from 'child_process';

function runCmd(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

function runRawCmd(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch {
    return null;
  }
}

function getCommitSha() {
  const sha = runCmd('git rev-parse HEAD');
  return sha || 'unknown';
}

function getBranch() {
  const showCurrent = runCmd('git branch --show-current');
  if (showCurrent && showCurrent.length > 0) {
    return showCurrent;
  }

  const abbrevRef = runCmd('git rev-parse --abbrev-ref HEAD');
  if (abbrevRef && abbrevRef !== 'HEAD') {
    return abbrevRef;
  }

  const envBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (envBranch) {
    return envBranch;
  }

  const nameRev = runCmd('git name-rev --name-only HEAD');
  if (nameRev && !nameRev.includes('undefined')) {
    return `${nameRev} (detached)`;
  }

  return 'HEAD (detached)';
}

function getDiffStat() {
  let label = 'origin/main...HEAD';
  let diff = runRawCmd('git diff --stat origin/main...HEAD');
  if (diff === null) {
    label = 'main...HEAD';
    diff = runRawCmd('git diff --stat main...HEAD');
  }

  // Preserve leading spaces of diff-stat while trimming trailing empty lines
  const formattedDiff = diff ? diff.replace(/^\r?\n+|\s+$/g, '') : 'No diff (or working tree clean against base)';

  return {
    diffLabel: label,
    diffStat: formattedDiff,
  };
}

function getCiStatus(sha) {
  const ghVersion = runCmd('gh --version');
  if (!ghVersion) {
    return 'not available (gh CLI not installed)';
  }

  const authStatus = runCmd('gh auth status');
  if (authStatus === null) {
    return 'not available (gh CLI not authenticated)';
  }

  const runsJson = runCmd(`gh run list --commit ${sha} -L 1 --json databaseId,status,conclusion,attempt,url`);
  if (!runsJson) {
    return 'not available';
  }

  try {
    const runs = JSON.parse(runsJson);
    if (!runs || runs.length === 0) {
      return 'no run found yet for this commit';
    }
    const r = runs[0];
    const conclusion = r.conclusion ? r.conclusion.toUpperCase() : 'IN_PROGRESS';
    const attempt = r.attempt || 1;
    return `${conclusion} (run id: ${r.databaseId}, attempt: ${attempt}, url: ${r.url})`;
  } catch {
    return 'not available';
  }
}

function main() {
  const sha = getCommitSha();
  const shortSha = sha.slice(0, 7);
  const branch = getBranch();
  const { diffLabel, diffStat } = getDiffStat();
  const ciStatus = getCiStatus(sha);

  console.log(`- **Commit SHA:** \`${sha}\` (short: \`${shortSha}\`)`);
  console.log(`- **Branch:** \`${branch}\``);
  console.log(`- **Files Changed (\`${diffLabel}\`):**`);
  console.log('```text');
  console.log(diffStat);
  console.log('```');
  console.log(`- **CI Status:** ${ciStatus}`);
}

main();
