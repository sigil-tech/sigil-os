# Phase 3 — Intelligence, Actuator & Polish: Exit Criteria

## Status

- [ ] Three active actuations work: auto-split on build, container pre-warm, dynamic keybindings
      Verification: trigger a build command in the terminal — shell should split automatically;
      run daemon for 1+ day — containers should pre-warm before typical session start;
      switch tool views — keybinding profile should update.

- [ ] Suggestion acceptance rate above 60% (self-testing over 1 week)
      Verification: `aetherctl suggestions` — check accepted/(accepted+dismissed) ratio.

- [ ] Split-pane and pop-out to Hyprland window work reliably
      Verification: Ctrl+\ to split, Ctrl+Shift+O to pop out active tool.

- [ ] Command palette covers all aetherctl commands and tool switches
      Verification: Ctrl+K — verify all 6 tool switches and aetherctl subcommands appear.

- [ ] One external developer has tested the full system and provided feedback
      Verification: written feedback documented in docs/external-tester-feedback.md

- [ ] No regression in daemon memory (still under 50MB RSS)
      Verification: `aetherctl status` — check rss_mb field after 48h uptime.

## Implementation Notes

See linked issues: #103, #104, #105, #106, #107, #108, #109, #110, #111, #112, #113, #114.
