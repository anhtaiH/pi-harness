import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { Type } from "typebox";

type Risk = "green" | "yellow" | "red";
type ProgressStatus = "started" | "in-progress" | "blocked" | "verifying" | "done";

type TaskRecord = {
  id: string;
  title: string;
  goal: string;
  risk: Risk;
  status?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  root: string;
  paths: {
    dir: string;
    packet: string;
    progress: string;
    evidence: string;
    taskJson: string;
  };
};

const STATUS_VALUES = ["started", "in-progress", "blocked", "verifying", "done"] as const;

export default function harnessExtension(pi: any) {
  ensureDirs();

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    ensureDirs();
    const activeTask = readActiveTaskId();
    ctx.ui.notify(`Pi harness lab loaded. Use /harness-status or harness_status.${activeTask ? ` Active task: ${activeTask}.` : ""}`, "info");
  });

  installRuntimePolicyGate(pi);

  pi.registerCommand("harness-status", {
    description: "Show local harness task status",
    handler: async (_args: string, ctx: any) => {
      ctx.ui.notify(statusText(), "info");
    },
  });

  pi.registerCommand("harness-new", {
    description: "Create a local harness task packet",
    handler: async (args: string, ctx: any) => {
      const title = args.trim() || "Untitled harness task";
      const task = createTask({ title, goal: title, risk: "green" });
      setActiveTask(task.id, "harness-new");
      ctx.ui.notify(`Created ${task.id}\n${relative(rootDir(), task.paths.packet)}\nActive task set.`, "info");
    },
  });

  pi.registerCommand("harness-use", {
    description: "Set the active local harness task",
    handler: async (args: string, ctx: any) => {
      const taskId = args.trim();
      if (!taskId) {
        ctx.ui.notify("Usage: /harness-use <taskId>", "error");
        return;
      }
      readTask(taskId);
      setActiveTask(taskId, "harness-use");
      ctx.ui.notify(`Active harness task: ${taskId}`, "info");
    },
  });

  pi.registerCommand("harness-finish", {
    description: "Run local finish gates for a harness task",
    handler: async (args: string, ctx: any) => {
      const taskId = args.trim();
      if (!taskId) {
        ctx.ui.notify("Usage: /harness-finish <taskId>", "error");
        return;
      }
      const result = runJsonScript("finish-task.mjs", [taskId, "--json"]);
      if (result.ok) clearActiveTask(taskId);
      ctx.ui.notify(result.ok ? `Finished ${taskId}` : `Finish blocked for ${taskId}\n${(result.findings || []).join("\n")}`, result.ok ? "success" : "error");
    },
  });

  pi.registerTool({
    name: "harness_status",
    label: "Harness Status",
    description: "List local Pi harness tasks and task artifact locations.",
    parameters: Type.Object({}),
    promptSnippet: "harness_status lists local Pi harness tasks and artifact paths.",
    promptGuidelines: [
      "Use harness_status before creating duplicate task packets in pi-harness-lab.",
    ],
    async execute() {
      return textResult(statusText());
    },
  });

  pi.registerTool({
    name: "harness_set_active_task",
    label: "Set Active Harness Task",
    description: "Set the active local task used by runtime policy and task-scoped tools.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_set_active_task sets the active task for runtime policy decisions.",
    promptGuidelines: [
      "Use harness_set_active_task when continuing an existing task before tool-heavy work.",
    ],
    async execute(_toolCallId: string, params: { taskId: string }) {
      const task = readTask(params.taskId);
      setActiveTask(task.id, "harness_set_active_task");
      return textResult(`Active harness task set to ${task.id}.`, { taskId: task.id });
    },
  });

  pi.registerTool({
    name: "harness_create_task",
    label: "Create Harness Task",
    description: "Create a local task packet, task.json, and progress file.",
    parameters: Type.Object({
      title: Type.String({ description: "Short task title." }),
      goal: Type.Optional(Type.String({ description: "Desired outcome. Defaults to title." })),
      risk: Type.Optional(
        Type.Union([
          Type.Literal("green"),
          Type.Literal("yellow"),
          Type.Literal("red"),
        ], { description: "Risk level." }),
      ),
    }),
    promptSnippet: "harness_create_task creates a local task packet and progress file.",
    promptGuidelines: [
      "Use harness_create_task for non-trivial pi-harness-lab work before editing files.",
    ],
    async execute(_toolCallId: string, params: { title: string; goal?: string; risk?: Risk }) {
      const task = createTask({
        title: params.title,
        goal: params.goal || params.title,
        risk: params.risk || "green",
      });
      setActiveTask(task.id, "harness_create_task");
      return textResult(`${formatTask(task)}\nactive: ${task.id}`, { taskId: task.id, paths: task.paths, active: true });
    },
  });

  pi.registerTool({
    name: "harness_record_progress",
    label: "Record Harness Progress",
    description: "Append a timestamped progress checkpoint to a local task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      note: Type.String({ description: "Progress checkpoint." }),
      status: Type.Optional(
        Type.Union(STATUS_VALUES.map((value) => Type.Literal(value)), {
          description: "Current status.",
        }),
      ),
    }),
    promptSnippet: "harness_record_progress appends a progress checkpoint to a local harness task.",
    promptGuidelines: [
      "Use harness_record_progress after meaningful milestones, blockers, and verification.",
    ],
    async execute(_toolCallId: string, params: { taskId: string; note: string; status?: ProgressStatus }) {
      const task = readTask(params.taskId);
      const status = params.status || "in-progress";
      const line = `- ${new Date().toISOString()} [${status}] ${params.note}\n`;
      appendFileSync(task.paths.progress, line, "utf8");
      task.updatedAt = new Date().toISOString();
      writeJson(task.paths.taskJson, task);
      setActiveTask(task.id, "harness_record_progress");
      return textResult(`Recorded progress for ${task.id}.\n${relative(rootDir(), task.paths.progress)}`);
    },
  });

  pi.registerTool({
    name: "harness_task_doctor",
    label: "Harness Task Doctor",
    description: "Validate a local task packet, task.json, and progress file for required structure and filled scope.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_task_doctor validates task packet and progress structure.",
    promptGuidelines: [
      "Run harness_task_doctor after editing a task packet scope or before finishing a task.",
    ],
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("task-doctor.mjs", [params.taskId, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_evidence_doctor",
    label: "Harness Evidence Doctor",
    description: "Validate a local task evidence.md file for required completion labels.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_evidence_doctor validates local task evidence before completion.",
    promptGuidelines: [
      "Run harness_evidence_doctor before harness_finish_task when evidence was edited manually.",
    ],
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("evidence-doctor.mjs", [params.taskId, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_secret_scan",
    label: "Harness Secret Scan",
    description: "Scan the Pi harness lab for committed secret-like content and forbidden auth paths.",
    parameters: Type.Object({}),
    promptSnippet: "harness_secret_scan checks the lab for accidental secret material.",
    promptGuidelines: [
      "Run harness_secret_scan before finishing package or auth-related work.",
    ],
    async execute() {
      const result = runJsonScript("secret-scan.mjs", ["--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_source_review_package",
    label: "Harness Source Review Package",
    description: "Download npm package tarballs without installing them and write local source-review reports.",
    parameters: Type.Object({
      specs: Type.Array(Type.String({ description: "npm package specs, for example npm:pi-mcp-adapter@2.6.0." })),
    }),
    promptSnippet: "harness_source_review_package reviews package tarballs before install.",
    promptGuidelines: [
      "Use harness_source_review_package before installing third-party Pi packages.",
      "Do not install packages whose review verdict is blocked.",
    ],
    async execute(_toolCallId: string, params: { specs: string[] }) {
      const result = runJsonScript("source-review.mjs", [...params.specs, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_package_approval",
    label: "Harness Package Approval",
    description: "Validate or template manual package approval records for packages that automated source review blocks.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("doctor"),
        Type.Literal("list"),
        Type.Literal("template"),
      ], { description: "Approval action." }),
      spec: Type.Optional(Type.String({ description: "npm package spec for template, for example npm:@scope/pkg@1.2.3." })),
    }),
    promptSnippet: "harness_package_approval validates manual package approval records without installing packages.",
    promptGuidelines: [
      "Use harness_package_approval when a source review is blocked but a human approval path is being prepared.",
      "Do not install blocked packages unless a valid manual approval exists.",
    ],
    async execute(_toolCallId: string, params: { action: "doctor" | "list" | "template"; spec?: string }) {
      const args = [params.action, "--json"];
      if (params.spec) args.splice(1, 0, "--spec", params.spec);
      const result = runJsonScript("package-approval.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_tool_policy_check",
    label: "Harness Tool Policy Check",
    description: "Evaluate a proposed tool call against the local harness tool policy.",
    parameters: Type.Object({
      tool: Type.String({ description: "Tool name, for example bash, read, edit, harness_status." }),
      input: Type.Optional(Type.Any({ description: "Tool input object." })),
      taskId: Type.Optional(Type.String({ description: "Optional task id for task-scoped policy." })),
      yolo: Type.Optional(Type.Boolean({ description: "Whether to apply yolo policy for risky non-secret actions." })),
    }),
    promptSnippet: "harness_tool_policy_check evaluates tool calls before risky or unfamiliar actions.",
    promptGuidelines: [
      "Use harness_tool_policy_check before shell commands that may be destructive or externally visible.",
      "Secret reads must remain blocked even in yolo mode.",
    ],
    async execute(_toolCallId: string, params: { tool: string; input?: unknown; taskId?: string; yolo?: boolean }) {
      const args = [
        "check",
        "--tool",
        params.tool,
        "--input-json",
        JSON.stringify(params.input || {}),
        "--json",
      ];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.yolo) args.push("--yolo");
      const result = runJsonScript("tool-policy.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_policy_profile",
    label: "Harness Policy Profile",
    description: "List, apply, show, clear, or validate task-scoped policy profiles for MCP/subagent tools.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("show"), Type.Literal("apply"), Type.Literal("clear"), Type.Literal("clear-expired"), Type.Literal("prune"), Type.Literal("doctor")]),
      taskId: Type.Optional(Type.String({ description: "Task id under state/tasks for show/apply/clear." })),
      profile: Type.Optional(Type.String({ description: "Profile name such as mcp-discovery, subagent-review, or mcp-direct-selected." })),
      tools: Type.Optional(Type.Array(Type.String({ description: "Exact selected tool names for mcp-direct-selected." }))),
      ttlMinutes: Type.Optional(Type.Number({ description: "Profile TTL in minutes. Defaults to the CLI default; 0 keeps existing expiration." })),
      expiresAt: Type.Optional(Type.String({ description: "Explicit ISO expiration timestamp." })),
      clearOnFinish: Type.Optional(Type.Boolean({ description: "Clear this task policy after a successful finish gate. Defaults true." })),
      replace: Type.Optional(Type.Boolean({ description: "Replace existing task policy instead of merging." })),
      notes: Type.Optional(Type.String({ description: "Non-secret rationale for the policy profile." })),
    }),
    promptSnippet: "harness_policy_profile manages task-scoped allowlists for reviewed MCP/subagent surfaces.",
    promptGuidelines: [
      "Keep MCP and subagent tools blocked globally; use task-scoped profiles only after reviewing scope.",
      "Do not allow wildcard direct MCP tools; prefer exact selected tool names.",
    ],
    async execute(_toolCallId: string, params: { action: string; taskId?: string; profile?: string; tools?: string[]; ttlMinutes?: number; expiresAt?: string; clearOnFinish?: boolean; replace?: boolean; notes?: string }) {
      const args = [params.action, "--json"];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.profile) args.push("--profile", params.profile);
      if (params.tools?.length) args.push("--tools", params.tools.join(","));
      if (params.ttlMinutes !== undefined) args.push("--ttl-minutes", String(params.ttlMinutes));
      if (params.expiresAt) args.push("--expires-at", params.expiresAt);
      if (params.clearOnFinish === true) args.push("--clear-on-finish");
      if (params.clearOnFinish === false) args.push("--no-clear-on-finish");
      if (params.replace) args.push("--replace");
      if (params.notes) args.push("--notes", params.notes);
      const result = runJsonScript("policy-profile.mjs", args);
      if (params.taskId && params.action === "apply" && result.ok) setActiveTask(params.taskId, "harness_policy_profile");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_writer_lock",
    label: "Harness Writer Lock",
    description: "Acquire, release, or inspect the one-writer lock for implementation work.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("acquire"), Type.Literal("release")]),
      taskId: Type.Optional(Type.String({ description: "Task id for acquire." })),
      owner: Type.Optional(Type.String({ description: "Writer identity. Defaults to local user." })),
      scope: Type.Optional(Type.String({ description: "Write scope description." })),
      ttlMinutes: Type.Optional(Type.Number({ description: "Lock TTL in minutes." })),
    }),
    promptSnippet: "harness_writer_lock enforces one active writer for implementation work.",
    promptGuidelines: [
      "Acquire the writer lock before multi-file implementation work.",
      "Release the writer lock after verification or handoff.",
    ],
    async execute(_toolCallId: string, params: { action: string; taskId?: string; owner?: string; scope?: string; ttlMinutes?: number }) {
      const args = [params.action, "--json"];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.owner) args.push("--owner", params.owner);
      if (params.scope) args.push("--scope", params.scope);
      if (params.ttlMinutes) args.push("--ttl-minutes", String(params.ttlMinutes));
      const result = runJsonScript("writer-lock.mjs", args);
      if (params.action === "acquire" && result.ok && params.taskId) setActiveTask(params.taskId, "harness_writer_lock");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_record_provenance",
    label: "Harness Record Provenance",
    description: "Record task-scoped provenance for a review, subagent, decision, or handoff.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      kind: Type.String({ description: "Provenance kind, for example review, subagent, decision." }),
      source: Type.String({ description: "Agent/model/tool/source identity." }),
      scope: Type.String({ description: "What this source reviewed or changed." }),
      notes: Type.Optional(Type.String({ description: "Short notes." })),
    }),
    promptSnippet: "harness_record_provenance records who/what produced a review or handoff.",
    async execute(_toolCallId: string, params: { taskId: string; kind: string; source: string; scope: string; notes?: string }) {
      const result = runJsonScript("provenance.mjs", [
        "record",
        "--task",
        params.taskId,
        "--kind",
        params.kind,
        "--source",
        params.source,
        "--scope",
        params.scope,
        "--notes",
        params.notes || "",
        "--json",
      ]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_memory_add",
    label: "Harness Memory Add",
    description: "Add a local evidence-backed memory/rule entry for future Pi harness work.",
    parameters: Type.Object({
      kind: Type.Union([Type.Literal("rule"), Type.Literal("fact"), Type.Literal("decision"), Type.Literal("pattern"), Type.Literal("warning")]),
      text: Type.String({ description: "Memory text. Do not include secrets." }),
      source: Type.String({ description: "Source or evidence for this memory." }),
      scope: Type.Optional(Type.String({ description: "Scope such as global, pi-harness, project, package-review." })),
      confidence: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
      tags: Type.Optional(Type.Array(Type.String({ description: "Search tags." }))),
      taskId: Type.Optional(Type.String({ description: "Related task id." })),
      expiresAt: Type.Optional(Type.String({ description: "Optional ISO timestamp when this memory becomes stale." })),
    }),
    promptSnippet: "harness_memory_add stores local memory and rule entries with source references.",
    promptGuidelines: [
      "Use harness_memory_add only for reusable, sourced patterns; never store credentials or unsourced guesses.",
    ],
    async execute(_toolCallId: string, params: { kind: string; text: string; source: string; scope?: string; confidence?: string; tags?: string[]; taskId?: string; expiresAt?: string }) {
      const args = [
        "add",
        "--kind",
        params.kind,
        "--text",
        params.text,
        "--source",
        params.source,
        "--scope",
        params.scope || "global",
        "--confidence",
        params.confidence || "medium",
        "--tags",
        (params.tags || []).join(","),
        "--json",
      ];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.expiresAt) args.push("--expires-at", params.expiresAt);
      const result = runJsonScript("memory.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_memory_search",
    label: "Harness Memory Search",
    description: "Search local harness memory/rule entries.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      limit: Type.Optional(Type.Number({ description: "Maximum results. Defaults to 10." })),
    }),
    promptSnippet: "harness_memory_search searches local memory/rule entries.",
    promptGuidelines: [
      "Use harness_memory_search before repeating harness decisions, package policy, or workflow conventions.",
    ],
    async execute(_toolCallId: string, params: { query: string; limit?: number }) {
      const result = runJsonScript("memory.mjs", ["search", "--query", params.query, "--limit", String(params.limit || 10), "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_memory_import",
    label: "Harness Memory Import",
    description: "Import non-secret local memory/rule entries from a repository file with validation and de-duplication.",
    parameters: Type.Object({
      file: Type.String({ description: "Repository-relative JSON, JSONL, or Markdown file to import from." }),
      source: Type.String({ description: "Evidence/source label for imported entries." }),
      kind: Type.Optional(Type.Union([Type.Literal("rule"), Type.Literal("fact"), Type.Literal("decision"), Type.Literal("pattern"), Type.Literal("warning")])),
      scope: Type.Optional(Type.String({ description: "Scope for imported entries." })),
      confidence: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
      tags: Type.Optional(Type.Array(Type.String({ description: "Tags to add to imported entries." }))),
      taskId: Type.Optional(Type.String({ description: "Related task id." })),
      dryRun: Type.Optional(Type.Boolean({ description: "Preview import without writing entries." })),
    }),
    promptSnippet: "harness_memory_import imports non-secret repository-local memory entries.",
    promptGuidelines: [
      "Only import files inside this harness repository, never credential or auth paths.",
      "Dry-run first when importing older memory dumps.",
    ],
    async execute(_toolCallId: string, params: { file: string; source: string; kind?: string; scope?: string; confidence?: string; tags?: string[]; taskId?: string; dryRun?: boolean }) {
      const args = [
        "import",
        "--file",
        params.file,
        "--source",
        params.source,
        "--kind",
        params.kind || "fact",
        "--scope",
        params.scope || "global",
        "--confidence",
        params.confidence || "medium",
        "--tags",
        (params.tags || []).join(","),
        "--json",
      ];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.dryRun) args.push("--dry-run");
      const result = runJsonScript("memory.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_memory_prune",
    label: "Harness Memory Prune",
    description: "Dry-run or prune stale/duplicate local memory entries.",
    parameters: Type.Object({
      dryRun: Type.Optional(Type.Boolean({ description: "Preview removals without writing. Defaults true." })),
      stale: Type.Optional(Type.Boolean({ description: "Prune stale entries." })),
      duplicates: Type.Optional(Type.Boolean({ description: "Prune duplicate entries." })),
      all: Type.Optional(Type.Boolean({ description: "Prune stale and duplicate entries." })),
    }),
    promptSnippet: "harness_memory_prune previews or removes stale/duplicate memory entries.",
    promptGuidelines: [
      "Dry-run first and never prune memory to hide an unresolved evidence or policy issue.",
    ],
    async execute(_toolCallId: string, params: { dryRun?: boolean; stale?: boolean; duplicates?: boolean; all?: boolean }) {
      const args = ["prune", "--json"];
      if (params.dryRun !== false) args.push("--dry-run");
      if (params.stale) args.push("--stale");
      if (params.duplicates) args.push("--duplicates");
      if (params.all) args.push("--all");
      const result = runJsonScript("memory.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_memory_doctor",
    label: "Harness Memory Doctor",
    description: "Validate local memory/rule entries for schema, stale entries, and secret-like content.",
    parameters: Type.Object({}),
    promptSnippet: "harness_memory_doctor validates local memory entries.",
    async execute() {
      const result = runJsonScript("memory.mjs", ["doctor", "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_review_plan_lane",
    label: "Harness Review Plan Lane",
    description: "Plan a local review lane for a task without launching a live subagent.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      lane: Type.String({ description: "Review lane name, for example safety, tests, architecture, docs." }),
      reviewer: Type.Optional(Type.String({ description: "Reviewer identity or planned agent/model." })),
      scope: Type.String({ description: "What this lane should review." }),
      prompt: Type.String({ description: "Prompt or instructions for this review lane." }),
    }),
    promptSnippet: "harness_review_plan_lane records planned peer/subagent review lanes.",
    promptGuidelines: [
      "Use harness_review_plan_lane before spawning reviewers or when tracking manual review lanes.",
    ],
    async execute(_toolCallId: string, params: { taskId: string; lane: string; reviewer?: string; scope: string; prompt: string }) {
      const result = runJsonScript("review-lane.mjs", [
        "plan",
        "--task",
        params.taskId,
        "--lane",
        params.lane,
        "--reviewer",
        params.reviewer || "unassigned",
        "--scope",
        params.scope,
        "--prompt",
        params.prompt,
        "--json",
      ]);
      setActiveTask(params.taskId, "harness_review_plan_lane");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_review_run_lane",
    label: "Harness Review Run Lane",
    description: "Prepare or launch a bounded review lane; dry-run writes a prompt artifact without live execution.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      lane: Type.String({ description: "Review lane name, for example safety, tests, architecture, docs." }),
      reviewer: Type.Optional(Type.String({ description: "Reviewer identity or planned agent/model." })),
      scope: Type.String({ description: "What this lane should review." }),
      prompt: Type.String({ description: "Prompt or instructions for this review lane." }),
      agent: Type.Optional(Type.String({ description: "Subagent agent name. Defaults to reviewer." })),
      live: Type.Optional(Type.Boolean({ description: "Actually invoke ./bin/pi-harness. Defaults to false/dry-run." })),
      mainAgent: Type.Optional(Type.Boolean({ description: "Run with the main Pi agent instead of requiring the subagent tool." })),
      timeoutMs: Type.Optional(Type.Number({ description: "Live run timeout in milliseconds." })),
    }),
    promptSnippet: "harness_review_run_lane writes or launches bounded review-lane prompts.",
    promptGuidelines: [
      "Use dry-run first; apply the subagent-review policy profile before live subagent execution.",
      "Record resulting findings with harness_review_record_finding before synthesis.",
    ],
    async execute(_toolCallId: string, params: { taskId: string; lane: string; reviewer?: string; scope: string; prompt: string; agent?: string; live?: boolean; mainAgent?: boolean; timeoutMs?: number }) {
      const args = [
        "run",
        "--task",
        params.taskId,
        "--lane",
        params.lane,
        "--reviewer",
        params.reviewer || "unassigned",
        "--scope",
        params.scope,
        "--prompt",
        params.prompt,
        "--agent",
        params.agent || "harness-reviewer",
        "--json",
      ];
      if (params.live) args.push("--live");
      else args.push("--dry-run");
      if (params.mainAgent) args.push("--main-agent");
      if (params.timeoutMs) args.push("--timeout-ms", String(params.timeoutMs));
      const result = runJsonScript("review-lane.mjs", args);
      setActiveTask(params.taskId, "harness_review_run_lane");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_review_record_finding",
    label: "Harness Review Record Finding",
    description: "Record a structured finding from a local review lane.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      laneId: Type.String({ description: "Review lane id." }),
      severity: Type.Optional(Type.Union([Type.Literal("info"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("critical")])),
      title: Type.String({ description: "Finding title." }),
      detail: Type.String({ description: "Finding detail." }),
      recommendation: Type.String({ description: "Recommended action." }),
      file: Type.Optional(Type.String({ description: "Related file, if any." })),
      line: Type.Optional(Type.String({ description: "Related line, if any." })),
      source: Type.Optional(Type.String({ description: "Reviewer/model/source identity." })),
    }),
    promptSnippet: "harness_review_record_finding records structured review findings.",
    async execute(_toolCallId: string, params: { taskId: string; laneId: string; severity?: string; title: string; detail: string; recommendation: string; file?: string; line?: string; source?: string }) {
      const args = [
        "finding",
        "--task",
        params.taskId,
        "--lane-id",
        params.laneId,
        "--severity",
        params.severity || "medium",
        "--title",
        params.title,
        "--detail",
        params.detail,
        "--recommendation",
        params.recommendation,
        "--source",
        params.source || "manual",
        "--json",
      ];
      if (params.file) args.push("--file", params.file);
      if (params.line) args.push("--line", params.line);
      const result = runJsonScript("review-lane.mjs", args);
      setActiveTask(params.taskId, "harness_review_record_finding");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_review_synthesize",
    label: "Harness Review Synthesize",
    description: "Write a synthesis Markdown file for a task's review lanes and findings.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_review_synthesize summarizes local review lane findings.",
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("review-lane.mjs", ["synthesize", "--task", params.taskId, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_review_doctor",
    label: "Harness Review Doctor",
    description: "Validate local review lane and finding records for a task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_review_doctor validates review lane scaffolding.",
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("review-lane.mjs", ["doctor", "--task", params.taskId, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_run_evals",
    label: "Harness Run Evals",
    description: "Run replayable local eval cases for the Pi harness lab.",
    parameters: Type.Object({}),
    promptSnippet: "harness_run_evals runs local smoke and policy evals.",
    async execute() {
      const result = runJsonScript("eval-runner.mjs", ["--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_package_provenance",
    label: "Harness Package Provenance",
    description: "Check installed Pi packages against source-review provenance and manual approvals.",
    parameters: Type.Object({}),
    promptSnippet: "harness_package_provenance verifies installed Pi packages have source reviews and required manual approvals.",
    async execute() {
      const result = runJsonScript("package-provenance.mjs", ["check", "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_create_tool_proposal",
    label: "Harness Create Tool Proposal",
    description: "Create a review-gated proposal for a tool or script the agent wants to build.",
    parameters: Type.Object({
      name: Type.String({ description: "Proposed tool name." }),
      summary: Type.String({ description: "What the tool should do and why it is needed." }),
      kind: Type.Optional(Type.String({ description: "script or extension-tool." })),
    }),
    promptSnippet: "harness_create_tool_proposal scaffolds an agent-generated tool proposal before implementation.",
    promptGuidelines: [
      "Use this when Pi decides it needs a new reusable tool.",
      "Do not promote proposals into active extensions until review and tests pass.",
    ],
    async execute(_toolCallId: string, params: { name: string; summary: string; kind?: string }) {
      const result = runJsonScript("tool-proposal.mjs", [
        "create",
        "--name",
        params.name,
        "--summary",
        params.summary,
        "--kind",
        params.kind || "script",
        "--json",
      ]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_record_external_write_intent",
    label: "Record External Write Intent",
    description: "Record a task-scoped intent before an external write-like action such as PR review, Jira update, Confluence edit, deploy, or release.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      provider: Type.String({ description: "External system, for example github, jira, confluence, slack, buildkite." }),
      action: Type.String({ description: "Write action, for example pr-review-comment, jira-transition, confluence-replace." }),
      target: Type.String({ description: "External target identifier or URL, without secrets." }),
      reason: Type.String({ description: "Why the external write is needed." }),
      expectedChange: Type.String({ description: "Expected external change." }),
      verification: Type.String({ description: "How the write will be read back or verified." }),
      rollback: Type.String({ description: "Rollback or correction plan if the write is wrong." }),
      ttlMinutes: Type.Optional(Type.Number({ description: "Intent TTL in minutes. Defaults to 60." })),
    }),
    promptSnippet: "harness_record_external_write_intent records planned external writes before execution.",
    promptGuidelines: [
      "Use harness_record_external_write_intent before any GitHub/Jira/Confluence/Slack/deploy write.",
      "Follow external writes with harness_record_external_write_proof or cancel the intent before finishing.",
    ],
    async execute(_toolCallId: string, params: {
      taskId: string;
      provider: string;
      action: string;
      target: string;
      reason: string;
      expectedChange: string;
      verification: string;
      rollback: string;
      ttlMinutes?: number;
    }) {
      const args = [
        "record",
        "--task",
        params.taskId,
        "--provider",
        params.provider,
        "--action",
        params.action,
        "--target",
        params.target,
        "--reason",
        params.reason,
        "--expected-change",
        params.expectedChange,
        "--verification",
        params.verification,
        "--rollback",
        params.rollback,
        "--json",
      ];
      if (params.ttlMinutes) args.push("--ttl-minutes", String(params.ttlMinutes));
      const result = runJsonScript("external-write.mjs", args);
      setActiveTask(params.taskId, "harness_record_external_write_intent");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_record_external_write_proof",
    label: "Record External Write Proof",
    description: "Record read-back proof after an external write-like action.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      intentId: Type.String({ description: "External write intent id." }),
      commandOrInspection: Type.String({ description: "Command, tool call, or inspection used to perform or verify the write." }),
      result: Type.String({ description: "Observed result." }),
      readBack: Type.String({ description: "Read-back proof from the external system." }),
    }),
    promptSnippet: "harness_record_external_write_proof records read-back proof for external writes.",
    promptGuidelines: [
      "Use harness_record_external_write_proof after every external write-like action that had an intent.",
    ],
    async execute(_toolCallId: string, params: { taskId: string; intentId: string; commandOrInspection: string; result: string; readBack: string }) {
      const result = runJsonScript("external-write.mjs", [
        "proof",
        "--task",
        params.taskId,
        "--intent",
        params.intentId,
        "--command",
        params.commandOrInspection,
        "--result",
        params.result,
        "--read-back",
        params.readBack,
        "--json",
      ]);
      setActiveTask(params.taskId, "harness_record_external_write_proof");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_cancel_external_write_intent",
    label: "Cancel External Write Intent",
    description: "Close a planned external write intent without performing the external write.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      intentId: Type.String({ description: "External write intent id." }),
      reason: Type.String({ description: "Why the planned external write was not performed." }),
    }),
    promptSnippet: "harness_cancel_external_write_intent closes unused external-write intents.",
    async execute(_toolCallId: string, params: { taskId: string; intentId: string; reason: string }) {
      const result = runJsonScript("external-write.mjs", [
        "cancel",
        "--task",
        params.taskId,
        "--intent",
        params.intentId,
        "--reason",
        params.reason,
        "--json",
      ]);
      setActiveTask(params.taskId, "harness_cancel_external_write_intent");
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_external_write_doctor",
    label: "External Write Doctor",
    description: "Validate task-scoped external write intents, proofs, and cancellations.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_external_write_doctor validates external write intent closure and proof.",
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("external-write.mjs", ["doctor", "--task", params.taskId, "--json"]);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_trace_event",
    label: "Harness Trace Event",
    description: "Append a redacted structured event to a local run trace.",
    parameters: Type.Object({
      runId: Type.String({ description: "Trace run id." }),
      eventType: Type.String({ description: "Event type, for example start, tool, checkpoint, finish." }),
      taskId: Type.Optional(Type.String({ description: "Related task id." })),
      label: Type.Optional(Type.String({ description: "Short event label." })),
      status: Type.Optional(Type.String({ description: "Status value." })),
      data: Type.Optional(Type.Any({ description: "Small structured payload." })),
    }),
    promptSnippet: "harness_trace_event records useful milestones in state/traces.",
    async execute(_toolCallId: string, params: { runId: string; eventType: string; taskId?: string; label?: string; status?: string; data?: unknown }) {
      const args = [
        params.eventType,
        "--run",
        params.runId,
        "--data-json",
        JSON.stringify(params.data || {}),
        "--json",
      ];
      if (params.taskId) args.push("--task", params.taskId);
      if (params.label) args.push("--label", params.label);
      if (params.status) args.push("--status", params.status);
      const result = runJsonScript("trace-event.mjs", args);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });

  pi.registerTool({
    name: "harness_write_evidence",
    label: "Write Harness Evidence",
    description: "Write completion evidence for a local harness task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
      summary: Type.String({ description: "What changed or what was learned." }),
      positiveProof: Type.String({ description: "Passing command, inspection, or confirmed behavior." }),
      negativeProof: Type.String({ description: "Regression or failure-mode check." }),
      commandsRun: Type.String({ description: "Commands or inspections performed." }),
      skippedChecks: Type.Optional(Type.String({ description: "Skipped checks, reasons, and residual risk." })),
      diffRiskNotes: Type.Optional(Type.String({ description: "Diff or migration risks and mitigations." })),
      memoryCandidates: Type.Optional(Type.String({ description: "Potential future memory/rule entries." })),
    }),
    promptSnippet: "harness_write_evidence writes the required completion proof for a local harness task.",
    promptGuidelines: [
      "Use harness_write_evidence before claiming pi-harness-lab work is complete.",
    ],
    async execute(_toolCallId: string, params: {
      taskId: string;
      summary: string;
      positiveProof: string;
      negativeProof: string;
      commandsRun: string;
      skippedChecks?: string;
      diffRiskNotes?: string;
      memoryCandidates?: string;
    }) {
      const task = readTask(params.taskId);
      const evidence = [
        `# Evidence: ${task.id}`,
        "",
        "## Summary",
        "",
        params.summary,
        "",
        "## Positive Proof",
        "",
        `- Command or inspection: ${params.positiveProof}`,
        "- Result: PASS",
        "",
        "## Negative Proof",
        "",
        `- Regression or failure-mode check: ${params.negativeProof}`,
        "- Result: PASS",
        "",
        "## Commands Run",
        "",
        "```text",
        params.commandsRun,
        "```",
        "",
        "## Skipped Checks",
        "",
        params.skippedChecks || "- Check: none\n- Reason: no skipped checks\n- Residual risk: none identified",
        "",
        "## Diff Risk Notes",
        "",
        params.diffRiskNotes || "- Risk: local task state only\n- Mitigation: evidence doctor and finish gates",
        "",
        "## Memory Candidates",
        "",
        params.memoryCandidates || "- Candidate: none\n- Source: this task\n- Confidence: n/a",
        "",
        "## End",
        "",
        "Task evidence complete.",
        "",
      ].join("\n");
      writeFileSync(task.paths.evidence, evidence, "utf8");
      task.updatedAt = new Date().toISOString();
      writeJson(task.paths.taskJson, task);
      const doctor = runJsonScript("evidence-doctor.mjs", [task.id, "--json"]);
      return textResult(`Wrote evidence for ${task.id}.\n${relative(rootDir(), task.paths.evidence)}\n\n${JSON.stringify(doctor, null, 2)}`, doctor);
    },
  });

  pi.registerTool({
    name: "harness_finish_task",
    label: "Finish Harness Task",
    description: "Run local finish gates for a task and mark it done only if evidence and secret checks pass.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task id under state/tasks." }),
    }),
    promptSnippet: "harness_finish_task runs evidence and secret gates before finalizing a task.",
    promptGuidelines: [
      "Use harness_finish_task after harness_write_evidence and before claiming completion.",
    ],
    async execute(_toolCallId: string, params: { taskId: string }) {
      const result = runJsonScript("finish-task.mjs", [params.taskId, "--json"]);
      if (result.ok) clearActiveTask(params.taskId);
      return textResult(JSON.stringify(result, null, 2), result);
    },
  });
}

function installRuntimePolicyGate(pi: any) {
  pi.on("tool_call", async (event: any, ctx: any) => {
    ensureDirs();
    const config = readJsonFile(join(rootDir(), "harness.config.json"), {}) as any;
    if (config?.toolPolicy?.runtimeEnforcement === false) return undefined;

    const taskId = taskIdFromInput(event.input) || readActiveTaskId() || activeWriterLockTaskId();
    const args = [
      "check",
      "--tool",
      String(event.toolName || ""),
      "--input-json",
      JSON.stringify(event.input || {}),
      "--json",
    ];
    if (taskId) args.push("--task", taskId);
    if (runtimeYoloEnabled()) args.push("--yolo");

    const result = runJsonScript("tool-policy.mjs", args);
    writeToolPolicyAudit({
      timestamp: new Date().toISOString(),
      taskId: taskId || "",
      tool: event.toolName,
      decision: result.decision || (result.ok ? "allow" : "block"),
      reason: result.reason || "",
      risk: result.risk || "",
      input: summarizeToolInput(event.input),
    });

    if (!result.ok || result.decision === "block") {
      const reason = `Harness policy blocked ${event.toolName}: ${result.reason || "blocked"}`;
      if (ctx.hasUI) ctx.ui.notify(reason, "error");
      return { block: true, reason };
    }

    if (result.decision === "audit" && ctx.hasUI) {
      ctx.ui.notify(`Harness policy audit for ${event.toolName}: ${result.reason}`, "warning");
    }

    return undefined;
  });
}

function rootDir(): string {
  if (process.env.PI_HARNESS_ROOT) return resolve(process.env.PI_HARNESS_ROOT);
  let dir = resolve(process.cwd());
  while (true) {
    if (existsSync(join(dir, "harness.config.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) return resolve(process.cwd());
    dir = parent;
  }
}

function readActiveTaskId(): string | undefined {
  const active = readJsonFile(join(rootDir(), "state", "active-task.json"), null) as { taskId?: string } | null;
  if (!active?.taskId) return undefined;
  try {
    const task = readTask(active.taskId) as TaskRecord & { status?: string };
    if (task.status === "done") return undefined;
    return task.id;
  } catch {
    return undefined;
  }
}

function setActiveTask(taskId: string, source: string) {
  const task = readTask(taskId);
  writeJson(join(rootDir(), "state", "active-task.json"), {
    taskId: task.id,
    source,
    updatedAt: new Date().toISOString(),
  });
}

function clearActiveTask(taskId: string) {
  const active = readJsonFile(join(rootDir(), "state", "active-task.json"), null) as { taskId?: string } | null;
  if (active?.taskId === taskId) {
    writeJson(join(rootDir(), "state", "active-task.json"), {
      taskId: "",
      source: "clear",
      updatedAt: new Date().toISOString(),
    });
  }
}

function activeWriterLockTaskId(): string | undefined {
  const lock = readJsonFile(join(rootDir(), "state", "locks", "writer-lock.json"), null) as { taskId?: string; releasedAt?: string; expiresAt?: string } | null;
  if (!lock?.taskId || lock.releasedAt) return undefined;
  if (lock.expiresAt && Date.parse(lock.expiresAt) < Date.now()) return undefined;
  return lock.taskId;
}

function taskIdFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as { taskId?: unknown }).taskId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function runtimeYoloEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.PI_HARNESS_YOLO || process.env.PI_WEBFLOW_YOLO || "");
}

function summarizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return { value: redactText(String(input || "")) };
  const value = input as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ["path", "command", "taskId", "action", "provider", "target", "intentId"]) {
    if (typeof value[key] === "string") summary[key] = truncate(redactText(String(value[key])), 500);
  }
  return summary;
}

function writeToolPolicyAudit(entry: Record<string, unknown>) {
  appendFileSync(join(rootDir(), "state", "policy", "tool-policy-audit.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

function readJsonFile(path: string, fallback: unknown): unknown {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function redactText(text: string): string {
  return text
    .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g, "***REDACTED_PRIVATE_KEY***")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "***REDACTED_OPENAI_KEY***")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, "***REDACTED_GITHUB_TOKEN***")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, "***REDACTED_GITHUB_TOKEN***")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, "***REDACTED_SLACK_TOKEN***")
    .replace(/\bAIza[0-9A-Za-z_-]{12,}\b/g, "***REDACTED_GOOGLE_KEY***")
    .replace(/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Za-z0-9_]*=)([^\s'"`]+)/gi, "$1***");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ensureDirs() {
  const root = rootDir();
  for (const path of [
    join(root, "state"),
    join(root, "state", "tasks"),
    join(root, "state", "sessions"),
    join(root, "state", "notes"),
    join(root, "state", "reviews"),
    join(root, "state", "evals"),
    join(root, "state", "locks"),
    join(root, "state", "memory"),
    join(root, "state", "package-reviews"),
    join(root, "state", "provenance"),
    join(root, "state", "policy"),
    join(root, "state", "status"),
    join(root, "state", "tool-proposals"),
    join(root, "state", "traces"),
  ]) {
    mkdirSync(path, { recursive: true });
  }
}

function createTask(input: { title: string; goal: string; risk: Risk }): TaskRecord {
  ensureDirs();
  const root = rootDir();
  const id = `${slug(input.title)}-${timestampId()}`;
  const dir = join(root, "state", "tasks", id);
  mkdirSync(dir, { recursive: true });

  const task: TaskRecord = {
    id,
    title: input.title,
    goal: input.goal,
    risk: input.risk,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root,
    paths: {
      dir,
      packet: join(dir, "packet.md"),
      progress: join(dir, "progress.md"),
      evidence: join(dir, "evidence.md"),
      taskJson: join(dir, "task.json"),
    },
  };

  writeJson(task.paths.taskJson, task);
  writeFileSync(task.paths.packet, packetMarkdown(task), "utf8");
  writeFileSync(task.paths.progress, progressMarkdown(task), "utf8");
  return task;
}

function readTask(taskId: string): TaskRecord {
  const taskJson = join(rootDir(), "state", "tasks", taskId, "task.json");
  if (!existsSync(taskJson)) {
    throw new Error(`Unknown harness task: ${taskId}`);
  }
  return JSON.parse(readFileSync(taskJson, "utf8")) as TaskRecord;
}

function listTasks(): TaskRecord[] {
  const tasksDir = join(rootDir(), "state", "tasks");
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir)
    .map((name) => join(tasksDir, name, "task.json"))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as TaskRecord)
    .sort((a, b) => {
      const aTime = statSync(a.paths.taskJson).mtimeMs;
      const bTime = statSync(b.paths.taskJson).mtimeMs;
      return bTime - aTime;
    });
}

function statusText(): string {
  ensureDirs();
  const root = rootDir();
  const tasks = listTasks();
  const activeTask = readActiveTaskId();
  const open = tasks.filter((task) => !["done", "blocked"].includes(task.status || "open"));
  const done = tasks.filter((task) => task.status === "done");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const lines = [
    `Pi harness lab: ${root}`,
    `Tasks: ${tasks.length} (${open.length} open, ${done.length} done, ${blocked.length} blocked)`,
    `Active task: ${activeTask || "none"}`,
    "",
  ];

  if (tasks.length === 0) {
    lines.push("No tasks yet. Use /harness-new or harness_create_task.");
  } else {
    const ordered = [...open, ...blocked, ...done].slice(0, 10);
    for (const task of ordered) {
      lines.push(`- ${task.id} [${task.status || "open"}/${task.risk}] ${task.title}`);
      lines.push(`  packet: ${relative(root, task.paths.packet)}`);
      lines.push(`  evidence: ${relative(root, task.paths.evidence)}`);
    }
  }

  return lines.join("\n");
}

function packetMarkdown(task: TaskRecord): string {
  return [
    `# Task Packet: ${task.id}`,
    "",
    "## Goal",
    "",
    task.goal,
    "",
    "## Workspace",
    "",
    `- Root: ${task.root}`,
    "- Harness: pi-harness-lab",
    "- Worktree: not created by default",
    "",
    "## Risk",
    "",
    `- Risk level: ${task.risk}`,
    "- Reason: user-scoped local harness task",
    "",
    "## Scope",
    "",
    "- Allowed files or areas: define before editing.",
    "- Forbidden files or areas: credentials, auth files, token stores, unrelated user files.",
    "- Non-goals: broad replacement of ~/.agent-harness until explicitly approved.",
    "",
    "## Current State",
    "",
    "- Created from Pi harness lab.",
    "",
    "## Desired Behavior",
    "",
    "- Define exact expected behavior before implementation.",
    "",
    "## Verification",
    "",
    "- Required checks: choose the smallest meaningful checks.",
    "- Optional checks: broader tests when risk justifies them.",
    "- Manual checks: record screenshots or command output when relevant.",
    "",
    "## Stop Conditions",
    "",
    "- Stop if secrets are required.",
    "- Stop if production-affecting actions are required.",
    "- Stop if destructive actions are required outside the active task scope.",
    "- Stop after 3 failed attempts and re-plan.",
    "",
  ].join("\n");
}

function progressMarkdown(task: TaskRecord): string {
  return [
    `# Progress: ${task.id}`,
    "",
    "## Current State",
    "",
    "- Status: started",
    `- Working directory: ${task.root}`,
    `- Latest checkpoint: ${task.createdAt}`,
    "",
    "## Checkpoints",
    "",
    `- ${task.createdAt} [started] Task packet created.`,
    "",
  ].join("\n");
}

function formatTask(task: TaskRecord): string {
  const root = rootDir();
  return [
    `Created task ${task.id}`,
    `packet: ${relative(root, task.paths.packet)}`,
    `progress: ${relative(root, task.paths.progress)}`,
    `evidence: ${relative(root, task.paths.evidence)}`,
  ].join("\n");
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runJsonScript(scriptName: string, args: string[]): any {
  const root = rootDir();
  try {
    const output = execFileSync(process.execPath, [join(root, "scripts", scriptName), ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(output);
  } catch (error: any) {
    const output = String(error?.stdout || "");
    if (output.trim()) return JSON.parse(output);
    throw error;
  }
}

function slug(value: string): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return clean || "task";
}

function timestampId(): string {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}
