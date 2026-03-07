# Phase 2 — Aether Shell v0: Exit Criteria

## Status

- [ ] Engineer uses Aether Shell as sole interface for a full day of development without switching back to the native WM
      Verification: boot into NixOS on 2017 MBP, launch aether-shell, work for a full day
      Status: pending NVMe install on 2017 MacBook Pro

- [ ] All 6 views functional: Terminal, Editor, Browser, Git, Containers, Insights
      Verification: open each view via Cmd+1 through Cmd+6, verify each renders and responds
      Status: implemented, requires Linux runtime test

- [ ] Terminal view: PTY connected, commands execute and output returns
      Verification: `echo hello` in terminal returns "hello"

- [ ] Editor view: Neovim launches, LSP works, session persists across view switches
      Verification: open a .go file, verify gopls provides completions, switch views and return

- [ ] Suggestion bar receives live daemon suggestions
      Verification: run daemon, trigger activity, verify suggestions appear in bar within 60s

- [ ] AI mode: routes a query through daemon to Cactus, response renders in content pane
      Verification: Alt+Tab, type "what files did I edit today?", verify routed response appears

- [ ] Shell total memory under 200MB (shell process + WebView, daemon excluded)
      Verification: `ps aux | grep aether-shell`, check RSS column after 30min of use

- [ ] No PTY state lost when switching between tool views
      Verification: start a long-running process in terminal, switch to git view, switch back — process still running
