#!/usr/bin/env node
import { execSync } from 'child_process';

function runCmd(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

function getCommitSha() {
  const sha = runCmd('git rev-parse HEAD');
  return sha || 'unknown';
}

function getBranch() {
  const branch = runCmd('git rev-parse --abbrev-ref HEAD');
  return branch || 'unknown';
}

function getDiffStat() {
  let diff = runCmd('git diff --stat origin/main...HEAD');
  if (diff === null) {
    diff = runCmd('git diff --stat main...HEAD');
  }
  return diff || 'No diff (or working tree clean against base)';
}

function getCiStatus(sha) {
  // Check if gh is installed and authenticated
  const ghVersion = runCmd('gh --version');
  if (!ghVersion) {
    return 'CI: not available';
  }

  const authStatus = runCmd('gh auth status');
  if (authStatus === null) {
    return 'CI: not available';
  }

  const runsJson = runCmd(`gh run list --commit ${sha} -L 1 --json databaseId,status,conclusion,attempt,url`);
  if (!runsJson) {
    return 'CI: not available';
  }

  try {
    const runs = JSON.parse(runsJson);
    if (!runs || runs.length === 0) {
      return 'CI: no run found yet for this commit';
    }
    const r = runs[0];
    const conclusion = r.conclusion ? r.conclusion.toUpperCase() : 'IN_PROGRESS';
    const attempt = r.attempt || 1;
    return `${conclusion} (run id: ${r.databaseId}, attempt: ${attempt}, url: ${r.url})`;
  } catch {
    return 'CI: not available';
  }
}

function main() {
  const sha = getCommitSha();
  const shortSha = sha.slice(0, 7);
  const branch = getBranch();
  const diffStat = getDiffStat();
  const ciStatus = getCiStatus(sha);

  console.log('```markdown');
  console.log(`- **Commit SHA:** \`${sha}\` (short: \`${shortSha}\`)`);
  console.log(`- **Branch:** \`${branch}\``);
  console.log('- **Files Changed (`origin/main...HEAD`):**');
  console.log('```text');
  console.log(diffStat);
  console.log('```');
  console.log(`- **CI Status:** ${ciStatus}`);
  console.log('```');
}

main();
