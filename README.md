# my-pi-ext

A collection of [pi](https://github.com/earendil-works/pi-coding-agent) extensions.

## Extensions

### linear-tui

Interactive Linear issue tracker overlay for pi's TUI. Browse issues, view details, filter by state — all without leaving your terminal.

**Usage:** `/linear` inside pi.

See [`linear-tui/README.md`](./linear-tui/README.md) for details.

## Installing extensions with symlinks

To use an extension from this repo in pi, create a symlink from pi's extensions directory:

```bash
# Link a single extension
ln -s ~/mevech/my-pi-ext/linear-tui ~/.pi/agent/extensions/linear-tui

# Or link the whole repo as a directory of extensions
ln -s ~/mevech/my-pi-ext ~/.pi/agent/extensions/my-pi-ext
```

After symlinking, restart pi. The extension's slash commands will be available automatically.

### How it works

- `~/.pi/agent/extensions/` is pi's auto-discovery directory
- Each subdirectory (or symlinked directory) with a valid `package.json` containing `"pi": { "extensions": [...] }` is loaded
- Symlinks let you develop extensions in any directory and have pi pick them up without copying
