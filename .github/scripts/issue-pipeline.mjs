#!/usr/bin/env node
// Runs refinement then estimation against a single GitHub issue.
// Requires: gh CLI authenticated via GH_TOKEN, ANTHROPIC_API_KEY, ISSUE_NUMBER, GITHUB_REPOSITORY.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const issueNumber = process.env.ISSUE_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

if (!issueNumber) throw new Error("ISSUE_NUMBER is required");
if (!repo) throw new Error("GITHUB_REPOSITORY is required");
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function promptPath(name) {
  return fileURLToPath(new URL(`../prompts/${name}`, import.meta.url));
}

async function callClaude(systemPrompt, userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content.map((block) => block.text).join("").trim();
}

function setLabels(remove, add) {
  const args = ["issue", "edit", issueNumber, "--repo", repo];
  for (const label of remove) args.push("--remove-label", label);
  for (const label of add) args.push("--add-label", label);
  if (args.length > 4) gh(args);
}

async function main() {
  const issue = ghJson([
    "issue", "view", issueNumber, "--repo", repo, "--json", "title,body",
  ]);

  const refinePrompt = readFileSync(promptPath("refine.md"), "utf8");
  const estimatePrompt = readFileSync(promptPath("estimate.md"), "utf8");

  const refinedBody = await callClaude(
    refinePrompt,
    `Title: ${issue.title}\n\nBody:\n${issue.body ?? ""}`,
  );
  gh(["issue", "edit", issueNumber, "--repo", repo, "--body", refinedBody]);
  setLabels(["status:needs-refinement", "status:accepted"], ["status:refined"]);
  console.log(`Issue #${issueNumber} refined.`);

  const estimateOutput = await callClaude(
    estimatePrompt,
    `Title: ${issue.title}\n\nRefined body:\n${refinedBody}`,
  );
  gh(["issue", "comment", issueNumber, "--repo", repo, "--body", estimateOutput]);

  const sizeMatch = estimateOutput.match(/SIZE:\s*(XS|S|M|L|XL)/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;
  const addLabels = ["status:estimated"];
  if (size) addLabels.push(`size:${size}`);
  setLabels(["status:refined"], addLabels);
  console.log(`Issue #${issueNumber} estimated: ${size ?? "unknown"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
