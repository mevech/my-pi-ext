/**
 * Linear TUI Extension
 *
 * Displays Linear issues in an interactive TUI overlay.
 *
 * Usage:
 *   /linear              — show all issues
 *   /linear todo         — filter by Todo state
 *   /linear backlog      — filter by Backlog state
 *   /linear in-progress  — filter by In Progress state
 *   /linear in-review    — filter by In Review state
 *   /linear done         — filter by Done state
 *   /linear all          — show all issues
 *
 * In the overlay:
 *   ↑↓     navigate
 *   enter  show issue details
 *   /      cycle filter (All → Todo → In Progress → In Review → Done → Backlog)
 *   r      refresh
 *   esc    close
 */

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  DynamicBorder,
  SelectList,
  type SelectItem,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";

// --- Types ---

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: { name: string } | null;
  assignee: { name: string } | null;
  project: { name: string } | null;
  priority: number;
}

interface LinearIssueDetail extends LinearIssue {
  description?: string | null;
  url?: string;
  labels?: { nodes: Array<{ name: string }> };
  comments?: { nodes: Array<{ body: string; user: { name: string } }> };
}

// --- GraphQL helpers ---

function getLinearToken(): string {
  const { execSync } = require("child_process") as typeof import("child_process");
  try {
    return execSync('security find-generic-password -s "linear-api-key" -w 2>/dev/null', {
      encoding: "utf-8",
    }).trim();
  } catch {
    return process.env.LINEAR_TOKEN ?? "";
  }
}

async function linearFetch(query: string, variables?: Record<string, unknown>): Promise<any> {
  const token = getLinearToken();
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as any;
  if (json.errors) {
    throw new Error(json.errors.map((e: any) => e.message).join(", "));
  }
  return json.data;
}

async function fetchIssues(filter?: string): Promise<LinearIssue[]> {
  const stateFilter = filter
    ? `filter: { state: { name: { eq: "${filter}" } } }`
    : "";
  const data = await linearFetch(`
    query {
      issues(first: 50, ${stateFilter}, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          state { name }
          assignee { name }
          project { name }
          priority
        }
      }
    }
  `);
  return data.issues.nodes;
}

async function fetchIssueDetail(id: string): Promise<LinearIssueDetail> {
  const data = await linearFetch(
    `
    query($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        url
        state { name }
        assignee { name }
        project { name }
        priority
        labels(first: 10) { nodes { name color } }
        comments(first: 5) { nodes { body user { name } createdAt } }
      }
    }
  `,
    { id }
  );
  return data.issue;
}

// --- Helpers ---

function stateColor(stateName: string | undefined): string {
  switch (stateName) {
    case "Todo":
      return "warning";
    case "In Progress":
      return "accent";
    case "In Review":
      return "accent";
    case "Done":
      return "success";
    case "Backlog":
      return "muted";
    case "Cancelled":
      return "dim";
    default:
      return "text";
  }
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "🔴 Urgent";
    case 2:
      return "🟠 High";
    case 3:
      return "🟡 Medium";
    case 4:
      return "🔵 Low";
    default:
      return "";
  }
}

const FILTER_CYCLE = [undefined, "Todo", "In Progress", "In Review", "Done", "Backlog"];

// --- Issue List Overlay ---

class IssueListOverlay implements Component {
  private issues: LinearIssue[] = [];
  private selectList: SelectList = new SelectList([], 1, {});
  private error: string | null = null;
  private loading = true;
  selectedIssueId: string | null = null;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private done: (result: string | null) => void,
    private currentFilter?: string
  ) {
    this.loadIssues();
  }

  private async loadIssues(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.tui.requestRender();
    try {
      this.issues = await fetchIssues(this.currentFilter);
      this.buildSelectList();
    } catch (err: any) {
      this.error = err.message ?? String(err);
    }
    this.loading = false;
    this.tui.requestRender();
  }

  private buildSelectList(): void {
    const th = this.theme;
    const items: SelectItem[] = this.issues.map((issue) => {
      const state = issue.state?.name ?? "Unknown";
      const project = issue.project?.name ?? "";
      const assignee = issue.assignee?.name ?? "";
      const prio = issue.priority > 0 ? priorityLabel(issue.priority) : "";
      const desc = [project, assignee, prio].filter(Boolean).join(" · ");
      return {
        value: issue.id,
        label: `${issue.identifier}  ${issue.title}`,
        description: desc ? `${state}  ${desc}` : state,
      };
    });
    this.selectList = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => th.fg("accent", t),
      selectedText: (t) => th.fg("accent", t),
      description: (t) => th.fg("muted", t),
      scrollInfo: (t) => th.fg("dim", t),
      noMatch: (t) => th.fg("warning", t),
    });
    this.selectList.onSelect = (item) => {
      this.selectedIssueId = item.value as string;
      this.done(item.value as string);
    };
    this.selectList.onCancel = () => this.done(null);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "r")) {
      this.loadIssues();
      return;
    }
    if (matchesKey(data, "/")) {
      const currentIdx = this.currentFilter
        ? FILTER_CYCLE.indexOf(this.currentFilter)
        : 0;
      const nextIdx = (currentIdx + 1) % FILTER_CYCLE.length;
      this.currentFilter = FILTER_CYCLE[nextIdx];
      this.loadIssues();
      return;
    }
    this.selectList.handleInput(data);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const th = this.theme;
    const lines: string[] = [];

    // Top border
    lines.push(th.fg("accent", `╭${"─".repeat(width - 2)}╮`));

    // Title
    const filterLabel = this.currentFilter ?? "All";
    const titleStr = ` Linear Issues — ${filterLabel} `;
    lines.push(
      th.fg("border", "│") +
        truncateToWidth(
          th.fg("accent", th.bold(titleStr)) + th.fg("text", ` (${this.issues.length})`),
          width - 2
        ) +
        th.fg("border", "│")
    );

    // Empty line
    lines.push(th.fg("border", "│") + " ".repeat(width - 2) + th.fg("border", "│"));

    if (this.loading) {
      lines.push(
        th.fg("border", "│") +
          truncateToWidth(th.fg("dim", "  Loading issues…"), width - 2) +
          th.fg("border", "│")
      );
    } else if (this.error) {
      lines.push(
        th.fg("border", "│") +
          truncateToWidth(th.fg("error", `  Error: ${this.error}`), width - 2) +
          th.fg("border", "│")
      );
    } else if (this.issues.length === 0) {
      lines.push(
        th.fg("border", "│") +
          truncateToWidth(th.fg("dim", "  No issues found."), width - 2) +
          th.fg("border", "│")
      );
    } else {
      const listLines = this.selectList.render(width - 2);
      for (const l of listLines) {
        lines.push(th.fg("border", "│") + l + th.fg("border", "│"));
      }
    }

    // Pad to fixed height
    const contentHeight =
      this.loading || this.error || this.issues.length === 0
        ? 1
        : Math.min(this.issues.length, 12);
    for (let i = contentHeight + 2; i < 16; i++) {
      lines.push(th.fg("border", "│") + " ".repeat(width - 2) + th.fg("border", "│"));
    }

    // Footer hints
    lines.push(
      th.fg("border", "│") +
        truncateToWidth(
          th.fg("dim", " ↑↓ navigate • enter details • / filter • r refresh • esc close"),
          width - 2
        ) +
        th.fg("border", "│")
    );

    // Bottom border
    lines.push(th.fg("accent", `╰${"─".repeat(width - 2)}╯`));

    return lines;
  }

  invalidate(): void {}
}

// --- Issue Detail Overlay ---

class IssueDetailOverlay implements Component {
  private issue: LinearIssueDetail | null = null;
  private error: string | null = null;
  private loading = true;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private done: () => void,
    private issueId: string
  ) {
    this.loadIssue();
  }

  private async loadIssue(): Promise<void> {
    this.loading = true;
    this.tui.requestRender();
    try {
      this.issue = await fetchIssueDetail(this.issueId);
    } catch (err: any) {
      this.error = err.message ?? String(err);
    }
    this.loading = false;
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "ctrl+c") ||
      matchesKey(data, "enter") ||
      matchesKey(data, "q")
    ) {
      this.done();
      return;
    }
  }

  render(width: number): string[] {
    const th = this.theme;
    const innerW = Math.max(1, width - 2);
    const border = (c: string) => th.fg("border", c);
    const padLine = (s: string) => truncateToWidth(s, innerW, "…", true);
    const lines: string[] = [];

    lines.push(border(`╭${"─".repeat(innerW)}╮`));

    if (this.loading) {
      for (let i = 0; i < 5; i++) {
        lines.push(
          border("│") + padLine(th.fg("dim", i === 0 ? " Loading…" : "")) + border("│")
        );
      }
      lines.push(border(`╰${"─".repeat(innerW)}╯`));
      return lines;
    }

    if (this.error) {
      lines.push(border("│") + padLine(th.fg("error", ` Error: ${this.error}`)) + border("│"));
      lines.push(border(`╰${"─".repeat(innerW)}╯`));
      return lines;
    }

    const issue = this.issue!;
    const stateName = issue.state?.name ?? "";
    const stateTag = th.fg(stateColor(stateName), `[${stateName}]`);

    // Title
    lines.push(
      border("│") +
        padLine(` ${th.fg("accent", issue.identifier)} ${stateTag} ${issue.title}`) +
        border("│")
    );
    lines.push(border("├") + "─".repeat(innerW) + border("┤"));

    // Meta
    if (issue.project) {
      lines.push(
        border("│") +
          padLine(` ${th.fg("dim", "Project:")} ${issue.project.name}`) +
          border("│")
      );
    }
    if (issue.assignee) {
      lines.push(
        border("│") +
          padLine(` ${th.fg("dim", "Assignee:")} ${issue.assignee.name}`) +
          border("│")
      );
    }
    if (issue.priority > 0) {
      lines.push(
        border("│") +
          padLine(` ${th.fg("dim", "Priority:")} ${priorityLabel(issue.priority)}`) +
          border("│")
      );
    }
    if (issue.url) {
      lines.push(border("│") + padLine(` ${th.fg("accent", issue.url)}`) + border("│"));
    }
    if (issue.labels?.nodes.length) {
      lines.push(
        border("│") +
          padLine(
            ` ${th.fg("dim", "Labels:")} ${issue.labels.nodes.map((l) => l.name).join(", ")}`
          ) +
          border("│")
      );
    }

    lines.push(border("├") + "─".repeat(innerW) + border("┤"));

    // Description
    if (issue.description) {
      const descLines = issue.description.split("\n").slice(0, 10);
      for (const dl of descLines) {
        lines.push(border("│") + padLine(` ${dl}`) + border("│"));
      }
    } else {
      lines.push(border("│") + padLine(th.fg("dim", " No description.")) + border("│"));
    }

    // Comments
    if (issue.comments?.nodes.length) {
      lines.push(border("├") + "─".repeat(innerW) + border("┤"));
      for (const c of issue.comments.nodes.slice(0, 3)) {
        const author = c.user?.name ?? "?";
        const body = (c.body?.split("\n")[0] ?? "").slice(0, 120);
        lines.push(border("│") + padLine(` ${th.fg("accent", author)}: ${body}`) + border("│"));
      }
    }

    // Pad
    while (lines.length < 28) {
      lines.push(border("│") + padLine("") + border("│"));
    }

    lines.push(border("├") + "─".repeat(innerW) + border("┤"));
    lines.push(border("│") + padLine(th.fg("dim", " esc/enter close")) + border("│"));
    lines.push(border(`╰${"─".repeat(innerW)}╯`));

    return lines;
  }

  invalidate(): void {}
}

// --- Extension entry ---

export default function linearTuiExtension(pi: ExtensionAPI) {
  pi.registerCommand("linear", {
    description: "Show Linear issues in TUI overlay",
    getArgumentCompletions: (prefix: string) => {
      const states = ["all", "todo", "backlog", "in-progress", "in-review", "done"];
      const filtered = states.filter((s) => s.startsWith(prefix.toLowerCase()));
      return filtered.length > 0 ? filtered.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const filterArg = args?.trim().toLowerCase();

      let filter: string | undefined;
      switch (filterArg) {
        case "todo":
          filter = "Todo";
          break;
        case "backlog":
          filter = "Backlog";
          break;
        case "in-progress":
          filter = "In Progress";
          break;
        case "in-review":
          filter = "In Review";
          break;
        case "done":
          filter = "Done";
          break;
        case "all":
        case "":
        case undefined:
          filter = undefined;
          break;
        default:
          ctx.ui.notify(
            `Unknown filter: ${filterArg}. Try: todo, backlog, in-progress, in-review, done, all`,
            "warning"
          );
          return;
      }

      // Show issue list overlay
      const selectedId = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => new IssueListOverlay(tui, theme, done, filter),
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: 80,
            maxHeight: 22,
          },
        }
      );

      // If user selected an issue, show detail overlay
      if (selectedId) {
        await ctx.ui.custom<void>(
          (tui, theme, _kb, done) => new IssueDetailOverlay(tui, theme, done, selectedId),
          {
            overlay: true,
            overlayOptions: {
              anchor: "center",
              width: 70,
              maxHeight: 30,
            },
          }
        );
      }
    },
  });
}
