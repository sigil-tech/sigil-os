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

  # Essential Wayland tools
  environment.systemPackages = with pkgs; [
    waybar
    hyprlock
    hyprpaper
    wl-clipboard
    grim
    slurp
    foot # fallback terminal
  ];

  # XDG portal for Wayland
  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
  };

  # Hyprland config via home-manager or direct file
  # The shell launches full-screen as the primary workspace app
  environment.etc."hypr/hyprland.conf".text = ''
    # Sigil OS Hyprland Configuration

    monitor=,preferred,auto,1

    # Auto-start Sigil Shell
    exec-once = sigil-shell

    # Window rules: shell is full-screen, no decorations
    windowrulev2 = fullscreen, class:^(sigil-shell)$
    windowrulev2 = noblur, class:^(sigil-shell)$
    windowrulev2 = noshadow, class:^(sigil-shell)$

    # Global keybinds
    $mod = SUPER

    bind = $mod, Return, focuswindow, class:^(sigil-shell)$
    bind = $mod SHIFT, Return, exec, foot  # fallback terminal
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
  '';
}
