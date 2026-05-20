# linear-tui

Interactive Linear issue tracker overlay for [pi](https://github.com/earendil-works/pi-coding-agent).

Browse your Linear issues, inspect details, filter by state — all inside pi's TUI.

## Setup

### 1. API key

Store your Linear API token in the macOS Keychain:

```bash
security add-generic-password -s "linear-api-key" -a "$USER" -w "lin_api_..."
```

The extension reads the token from the keychain at runtime — it's never stored on disk.

### 2. Install

From the repo root:

```bash
ln -s ~/mevech/my-pi-ext/linear-tui ~/.pi/agent/extensions/linear-tui
```

Then restart pi.

## Usage

Type `/linear` in pi:

| Command | Description |
|---------|-------------|
| `/linear` | Show all issues |
| `/linear todo` | Filter: Todo |
| `/linear backlog` | Filter: Backlog |
| `/linear in-progress` | Filter: In Progress |
| `/linear in-review` | Filter: In Review |
| `/linear done` | Filter: Done |
| `/linear all` | Show all |

### Key bindings (inside overlay)

| Key | Action |
|-----|--------|
| `↑↓` | Navigate issues |
| `enter` | Show issue details |
| `/` | Cycle filter (All → Todo → In Progress → In Review → Done → Backlog) |
| `r` | Refresh issues |
| `esc` | Close overlay |

## Development

```bash
cd ~/mevech/my-pi-ext/linear-tui
npm install        # install dependencies
```

The extension uses pi's `ctx.ui.custom()` overlay API with two components:

- `IssueListOverlay` — scrollable list with select menu
- `IssueDetailOverlay` — issue detail view with description, labels, comments

Data is fetched from Linear's GraphQL API via `fetch()`.
