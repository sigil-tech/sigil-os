{ config, lib, pkgs, ... }:
with lib;
let cfg = config.services.aether-shell;
in {
  options.services.aether-shell = {
    enable = mkEnableOption "Aether Shell";
    theme = {
      background    = mkOption { type = types.str; default = "#0a0a0a"; description = "Background color"; };
      foreground    = mkOption { type = types.str; default = "#e5e5e5"; description = "Foreground color"; };
      accent        = mkOption { type = types.str; default = "#6366f1"; description = "Accent color"; };
      border        = mkOption { type = types.str; default = "#222222"; description = "Border color"; };
      surface       = mkOption { type = types.str; default = "#111111"; description = "Surface background color"; };
      hover         = mkOption { type = types.str; default = "#1a1a1a"; description = "Hover background color"; };
      muted         = mkOption { type = types.str; default = "#888888"; description = "Muted foreground color"; };
      fontFamily    = mkOption { type = types.str; default = "'IBM Plex Mono', monospace"; description = "Font family"; };
      fontSize      = mkOption { type = types.str; default = "13px"; description = "Font size"; };
      borderRadius  = mkOption { type = types.str; default = "4px"; description = "Border radius"; };
    };
  };

  config = mkIf cfg.enable {
    home.file.".config/aether-shell/theme.css".text = ''
      :root {
        --color-bg:         ${cfg.theme.background};
        --color-fg:         ${cfg.theme.foreground};
        --color-accent:     ${cfg.theme.accent};
        --color-border:     ${cfg.theme.border};
        --color-bg-surface: ${cfg.theme.surface};
        --color-bg-hover:   ${cfg.theme.hover};
        --color-fg-muted:   ${cfg.theme.muted};
        --font-family:      ${cfg.theme.fontFamily};
        --font-size:        ${cfg.theme.fontSize};
        --border-radius:    ${cfg.theme.borderRadius};
      }
    '';
  };
}
