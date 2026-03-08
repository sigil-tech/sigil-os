{ config, pkgs, lib, ... }:
{
  # Wayland + Hyprland
  programs.hyprland.enable = true;

  # Display manager — auto-login to Hyprland
  services.greetd = {
    enable = true;
    settings.default_session = {
      command = "${pkgs.hyprland}/bin/Hyprland";
      user = "engineer";
    };
  };

  # Fonts
  fonts.packages = with pkgs; [
    ibm-plex
    dejavu_fonts
    nerd-fonts.jetbrains-mono
  ];
  fonts.fontconfig.defaultFonts.monospace = [ "IBM Plex Mono" "DejaVu Sans Mono" ];

  # Essential Wayland tools
  environment.systemPackages = with pkgs; [
    waybar
    hyprlock
    hyprpaper
    wl-clipboard
    grim
    slurp
    foot
  ];

  # XDG portal for Wayland
  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
  };

  # Write Hyprland config to engineer's home directory
  # Hyprland reads from ~/.config/hypr/hyprland.conf
  system.activationScripts.hyprlandConfig = ''
    mkdir -p /home/engineer/.config/hypr
    cat > /home/engineer/.config/hypr/hyprland.conf << 'HYPRCONF'
    # Sigil OS Hyprland Configuration

    monitor=,preferred,auto,1

    # Auto-start: terminal + waybar
    exec-once = foot
    exec-once = waybar -c /etc/waybar/config -s /etc/waybar/style.css

    # Global keybinds
    $mod = SUPER

    bind = $mod, Return, exec, foot
    bind = $mod, Q, killactive
    bind = $mod SHIFT, E, exit

    # View switching (sent to shell via hyprctl dispatch)
    bind = $mod, 1, focuswindow, class:^(sigil-shell)$
    bind = $mod, 2, focuswindow, class:^(sigil-shell)$
    bind = $mod, 3, focuswindow, class:^(sigil-shell)$
    bind = $mod, 4, focuswindow, class:^(sigil-shell)$
    bind = $mod, 5, focuswindow, class:^(sigil-shell)$
    bind = $mod, 6, focuswindow, class:^(sigil-shell)$

    # Pop-out window management
    bind = $mod SHIFT, O, togglefloating
    bind = $mod, F, fullscreen

    # Workspace basics
    bind = $mod, left, movefocus, l
    bind = $mod, right, movefocus, r
    bind = $mod, up, movefocus, u
    bind = $mod, down, movefocus, d

    # Lock screen
    bind = $mod, L, exec, hyprlock

    # Appearance
    general {
      gaps_in = 0
      gaps_out = 0
      border_size = 1
      col.active_border = rgb(6366f1)
      col.inactive_border = rgb(222222)
    }

    decoration {
      rounding = 0
    }

    input {
      kb_layout = us
      follow_mouse = 1
    }
HYPRCONF
    chown -R engineer:users /home/engineer/.config/hypr

    mkdir -p /home/engineer/.config/foot
    cat > /home/engineer/.config/foot/foot.ini << 'FOOTCONF'
[main]
font=IBM Plex Mono:size=13
font-bold=IBM Plex Mono:weight=bold:size=13

[colors]
background=0a0a0a
foreground=e5e5e5
FOOTCONF
    chown -R engineer:users /home/engineer/.config/foot
  '';

  # Waybar configuration for daemon status
  environment.etc."waybar/config".text = builtins.toJSON {
    layer = "top";
    position = "bottom";
    height = 24;
    modules-left = [ "hyprland/workspaces" ];
    modules-center = [];
    modules-right = [ "custom/sigild" "memory" "clock" ];
    "custom/sigild" = {
      exec = "sigilctl status --json 2>/dev/null | jq -r '\"sigild: \" + .status + \" | \" + .inference_mode'";
      interval = 30;
      format = "{}";
    };
    memory = {
      format = "{}% mem";
      interval = 10;
    };
    clock = {
      format = "{:%H:%M}";
    };
  };

  environment.etc."waybar/style.css".text = ''
    * {
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      color: #e5e5e5;
    }
    window#waybar {
      background: #0a0a0a;
      border-top: 1px solid #222222;
    }
    #custom-sigild {
      color: #6366f1;
      padding: 0 8px;
    }
  '';
}
