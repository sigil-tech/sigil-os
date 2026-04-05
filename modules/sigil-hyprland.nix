{ config, pkgs, lib, ... }:
{
  # Wayland + Hyprland
  programs.hyprland.enable = true;

  # Display manager — auto-login to Hyprland
  services.greetd = {
    enable = true;
    settings.default_session = {
      command = "${pkgs.hyprland}/bin/Hyprland";
      user = "nick";
    };
  };

  # Fonts
  fonts.fontDir.enable = true;
  fonts.packages = with pkgs; [
    fira-code
    dejavu_fonts
    nerd-fonts.jetbrains-mono
  ];
  fonts.fontconfig.enable = true;
  fonts.fontconfig.defaultFonts.monospace = [ "Fira Code" "DejaVu Sans Mono" ];

  # Ensure fontconfig cache directory exists for all users
  system.activationScripts.fontconfigCache = ''
    for u in /home/*; do
      user=$(basename "''$u")
      install -d -o "''$user" -g users "''$u/.cache/fontconfig"
    done
  '';

  # Essential Wayland tools
  environment.systemPackages = with pkgs; [
    waybar
    hyprlock
    hyprpaper
    wl-clipboard
    grim
    slurp
    foot
    mako  # notification daemon for notify-send
  ];

  # XDG portal for Wayland
  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
  };

  # Write Hyprland config to engineer's home directory
  # Hyprland reads from ~/.config/hypr/hyprland.conf
  system.activationScripts.hyprlandConfig = ''
    mkdir -p /home/nick/.config/hypr
    cat > /home/nick/.config/hypr/hyprland.conf << 'HYPRCONF'
# Sigil OS Hyprland Configuration

monitor=,preferred,auto,auto

# Auto-start: shell + waybar + notification daemon
exec-once = sigil-shell
exec-once = waybar -c /etc/waybar/config -s /etc/waybar/style.css
exec-once = mako

# Global keybinds
''$mod = SUPER

bind = ''$mod, Return, exec, foot
bind = ''$mod, B, exec, firefox
bind = ''$mod, Q, killactive
bind = ''$mod SHIFT, E, exit

# View switching (sent to shell via hyprctl dispatch)
bind = ''$mod, 1, focuswindow, class:^(sigil-shell)$
bind = ''$mod, 2, focuswindow, class:^(sigil-shell)$
bind = ''$mod, 3, focuswindow, class:^(sigil-shell)$
bind = ''$mod, 4, focuswindow, class:^(sigil-shell)$
bind = ''$mod, 5, focuswindow, class:^(sigil-shell)$
bind = ''$mod, 6, focuswindow, class:^(sigil-shell)$

# Pop-out window management
bind = ''$mod SHIFT, O, togglefloating
bind = ''$mod, F, fullscreen

# Workspace basics
bind = ''$mod, left, movefocus, l
bind = ''$mod, right, movefocus, r
bind = ''$mod, up, movefocus, u
bind = ''$mod, down, movefocus, d

# Lock screen
bind = ''$mod, L, exec, hyprlock

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
    chown -R nick:users /home/nick/.config/hypr

    mkdir -p /home/nick/.config/foot
    cat > /home/nick/.config/foot/foot.ini << 'FOOTCONF'
[main]
font=Fira Code:size=14
font-bold=Fira Code:weight=bold:size=14

[colors]
background=0a0a0a
foreground=e5e5e5
FOOTCONF
    chown -R nick:users /home/nick/.config/foot
  '';

  # Waybar configuration for daemon status
  environment.etc."waybar/config".text = builtins.toJSON {
    layer = "top";
    position = "top";
    height = 30;
    modules-left = [ "hyprland/workspaces" ];
    modules-center = [];
    modules-right = [ "custom/sigild" "network" "pulseaudio" "battery" "clock" ];
    "custom/sigild" = {
      exec = "sigilctl status --json 2>/dev/null | jq -r '\"sigild: \" + .status + \" | \" + .inference_mode'";
      interval = 30;
      format = "{}";
    };
    network = {
      format-wifi = "  {essid}";
      format-ethernet = "  {ifname}";
      format-disconnected = "  disconnected";
      tooltip-format = "{ifname}: {ipaddr}/{cidr}";
      interval = 10;
    };
    pulseaudio = {
      format = "{icon} {volume}%";
      format-muted = " muted";
      format-icons = {
        default = [ "" "" "" ];
      };
      on-click = "wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle";
    };
    battery = {
      interval = 30;
      format = "{icon} {capacity}%";
      format-charging = " {capacity}%";
      format-icons = [ "" "" "" "" "" ];
      states = {
        warning = 25;
        critical = 10;
      };
    };
    clock = {
      format = "{:%a %d %b  %H:%M}";
      tooltip-format = "{:%Y-%m-%d %H:%M:%S}";
    };
  };

  environment.etc."waybar/style.css".text = ''
    * {
      font-family: "Fira Code", Consolas, 'Courier New', monospace;
      font-size: 13px;
      color: #e5e5e5;
    }
    window#waybar {
      background: #0a0a0a;
      border-bottom: 1px solid #222222;
    }
    #custom-sigild {
      color: #6366f1;
      padding: 0 8px;
    }
    #network {
      padding: 0 6px;
    }
    #pulseaudio {
      padding: 0 6px;
    }
    #battery {
      padding: 0 6px;
    }
    #battery.warning {
      color: #f59e0b;
    }
    #battery.critical {
      color: #ef4444;
    }
    #clock {
      padding: 0 8px;
    }
  '';
}
