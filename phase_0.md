# Aether OS — Phase 0 Development Guide

## Getting from bare metal to a daily-driveable NixOS workstation + daemon scaffold

**Target hardware:** 2017 MacBook Pro (Intel, 8–16GB RAM, Broadcom Wi-Fi)  
**Target outcome:** A reproducible NixOS flake with Hyprland, Kitty, Neovim (Go + TS LSP), lazygit, Docker, ungoogled Chromium, and the skeleton of `aetherd`  
**Estimated time:** 1 weekend for the OS, 1 week for daemon v0

---

## Part 1: The Custom NixOS ISO

The 2017 MacBook Pro uses a Broadcom BCM43xx Wi-Fi chipset that requires proprietary firmware. The stock NixOS ISO doesn't include it. You need to build a custom ISO that bundles the Broadcom `wl` driver so you have Wi-Fi during installation.

### 1.1 Build environment

You need a working Linux machine (or VM) with Nix installed to build the ISO. If you're currently on macOS on the MacBook, you have two options: install Nix on macOS and cross-build, or spin up a Linux VM (UTM, Parallels, or a cloud instance) with Nix installed. The cloud instance is faster — a 4-core DigitalOcean droplet builds the ISO in ~30 minutes.

```bash
# Install Nix (on any Linux machine or macOS)
sh <(curl -L https://nixos.org/nix/install) --daemon

# Enable flakes
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

### 1.2 The ISO flake

Create a directory for the ISO build:

```
aether-iso/
├── flake.nix
└── iso.nix
```

**flake.nix:**

```nix
{
  description = "Aether OS custom installer ISO with Broadcom Wi-Fi";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs = { self, nixpkgs }: {
    nixosConfigurations.iso = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
        "${nixpkgs}/nixos/modules/installer/cd-dvd/channel.nix"
        ./iso.nix
      ];
    };
  };
}
```

**iso.nix:**

```nix
{ config, pkgs, lib, ... }:

{
  # Allow proprietary firmware (required for Broadcom)
  nixpkgs.config.allowUnfree = true;

  # Load the Broadcom wl driver
  boot.kernelModules = [ "wl" ];
  boot.extraModulePackages = [ config.boot.kernelPackages.broadcom_sta ];

  # Blacklist conflicting drivers
  boot.blacklistedKernelModules = [ "b43" "bcma" "brcmfmac" "brcmsmac" ];

  # Include useful tools in the installer
  environment.systemPackages = with pkgs; [
    vim
    git
    wget
    parted
    networkmanager
  ];

  # Enable NetworkManager for Wi-Fi during install
  networking.networkmanager.enable = true;

  # Enable wireless regulatory database
  hardware.wirelessRegulatoryDatabase = true;
}
```

### 1.3 Build the ISO

```bash
cd aether-iso
nix build .#nixosConfigurations.iso.config.system.build.isoImage

# The ISO will be at:
# result/iso/nixos-*.iso
ls -lh result/iso/
```

This takes 20–45 minutes depending on your build machine. The resulting ISO is ~1GB.

### 1.4 Flash and boot

```bash
# Find your USB drive (CAREFUL — this erases the drive)
lsblk

# Flash (replace /dev/sdX with your actual device)
sudo dd if=result/iso/nixos-*.iso of=/dev/sdX bs=4M status=progress oflag=sync
```

Boot the MacBook with the USB inserted. Hold the **Option (⌥)** key during boot to access the startup manager. Select the EFI boot option for the USB drive.

Once in the live environment, verify Wi-Fi works:

```bash
nmcli device wifi list
nmcli device wifi connect "YourNetwork" password "YourPassword"
ping -c 3 google.com
```

If Wi-Fi works, you're good. If not, use a USB-C ethernet adapter for installation and debug Wi-Fi after.

---

## Part 2: Disk Partitioning & Base Install

### 2.1 Partition the disk

This assumes you're wiping macOS entirely. If you want to dual-boot, adjust partition sizes accordingly and keep the existing EFI partition.

```bash
# Identify the NVMe drive
lsblk
# Usually /dev/nvme0n1 on MacBook Pros

# Wipe and create GPT table
sudo parted /dev/nvme0n1 -- mklabel gpt

# EFI boot partition (512MB)
sudo parted /dev/nvme0n1 -- mkpart ESP fat32 1MB 512MB
sudo parted /dev/nvme0n1 -- set 1 esp on

# Swap partition (match your RAM — 8GB or 16GB)
sudo parted /dev/nvme0n1 -- mkpart swap linux-swap 512MB 16.5GB

# Root partition (everything else)
sudo parted /dev/nvme0n1 -- mkpart root ext4 16.5GB 100%
```

### 2.2 Format

```bash
sudo mkfs.fat -F 32 -n BOOT /dev/nvme0n1p1
sudo mkswap -L swap /dev/nvme0n1p2
sudo mkfs.ext4 -L nixos /dev/nvme0n1p3
```

### 2.3 Mount and install

```bash
sudo mount /dev/disk/by-label/nixos /mnt
sudo mkdir -p /mnt/boot
sudo mount /dev/disk/by-label/BOOT /mnt/boot
sudo swapon /dev/disk/by-label/swap

# Generate initial config
sudo nixos-generate-config --root /mnt

# This creates:
#   /mnt/etc/nixos/configuration.nix
#   /mnt/etc/nixos/hardware-configuration.nix
```

At this point, **don't run nixos-install yet.** Instead, we're going to replace the generated config with our flake. But first, save the generated `hardware-configuration.nix` — it contains your machine-specific hardware detection that we'll incorporate into the flake.

```bash
cat /mnt/etc/nixos/hardware-configuration.nix
# Copy this content — you'll need it in the next step
```

---

## Part 3: The Aether Flake

This is the main deliverable of Phase 0. A single flake that declaratively defines the entire workstation. Clone this onto the target machine (or create it in /mnt during install).

### 3.1 Repository structure

```
aether/
├── flake.nix                  # Top-level flake
├── flake.lock                 # Auto-generated lockfile
├── hosts/
│   └── macbook/
│       ├── default.nix        # Machine-specific config
│       └── hardware.nix       # Generated hardware config (from nixos-generate-config)
├── modules/
│   ├── base.nix               # Core OS: boot, networking, users, locale
│   ├── hyprland.nix           # Compositor + Wayland session
│   ├── terminal.nix           # Kitty configuration
│   ├── editor.nix             # Neovim + LSP (Go, TypeScript)
│   ├── browser.nix            # Ungoogled Chromium
│   ├── dev-tools.nix          # Git, lazygit, Docker, dev utilities
│   └── fonts.nix              # IBM Plex Mono + fallbacks
├── home/
│   ├── default.nix            # Home Manager entry point
│   ├── hyprland.nix           # Hyprland user config (keybinds, rules, theme)
│   ├── kitty.nix              # Kitty user config (theme, font, shortcuts)
│   ├── neovim.nix             # Neovim user config (plugins, LSP, keymaps)
│   ├── git.nix                # Git user config
│   └── shell.nix              # Zsh/Bash config, starship prompt, aliases
└── daemon/                    # aetherd (Phase 1, scaffold now)
    ├── go.mod
    ├── go.sum
    ├── cmd/
    │   ├── aetherd/
    │   │   └── main.go
    │   └── aetherctl/
    │       └── main.go
    ├── internal/
    │   ├── collector/
    │   │   └── collector.go
    │   ├── analyzer/
    │   │   └── analyzer.go
    │   ├── actuator/
    │   │   └── actuator.go
    │   └── store/
    │       └── store.go
    └── aetherd.service         # systemd unit file
```

### 3.2 flake.nix

```nix
{
  description = "Aether OS — AI-native developer workstation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager/release-25.05";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nixos-hardware.url = "github:NixOS/nixos-hardware/master";
  };

  outputs = { self, nixpkgs, nixpkgs-unstable, home-manager, nixos-hardware, ... }:
  let
    system = "x86_64-linux";
    pkgs-unstable = import nixpkgs-unstable {
      inherit system;
      config.allowUnfree = true;
    };
  in {
    nixosConfigurations.aether = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit pkgs-unstable; };
      modules = [
        # Hardware
        ./hosts/macbook/default.nix

        # System modules
        ./modules/base.nix
        ./modules/hyprland.nix
        ./modules/terminal.nix
        ./modules/editor.nix
        ./modules/browser.nix
        ./modules/dev-tools.nix
        ./modules/fonts.nix

        # Home Manager
        home-manager.nixosModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.users.nick = import ./home;
          home-manager.extraSpecialArgs = { inherit pkgs-unstable; };
        }
      ];
    };
  };
}
```

### 3.3 modules/base.nix

```nix
{ config, pkgs, ... }:

{
  # Boot
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Broadcom Wi-Fi
  nixpkgs.config.allowUnfree = true;
  boot.kernelModules = [ "wl" ];
  boot.extraModulePackages = [ config.boot.kernelPackages.broadcom_sta ];
  boot.blacklistedKernelModules = [ "b43" "bcma" "brcmfmac" "brcmsmac" ];
  hardware.wirelessRegulatoryDatabase = true;

  # Networking
  networking.hostName = "aether";
  networking.networkmanager.enable = true;

  # Locale
  time.timeZone = "America/New_York";
  i18n.defaultLocale = "en_US.UTF-8";

  # User
  users.users.nick = {
    isNormalUser = true;
    description = "Nick";
    extraGroups = [ "networkmanager" "wheel" "docker" "video" "audio" ];
    shell = pkgs.zsh;
  };

  # Zsh as default shell
  programs.zsh.enable = true;

  # Core utilities
  environment.systemPackages = with pkgs; [
    wget
    curl
    unzip
    htop
    btop
    ripgrep
    fd
    jq
    tree
    file
    man-pages
  ];

  # Audio (PipeWire)
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };

  # Power management (important for laptop)
  services.thermald.enable = true;
  services.tlp = {
    enable = true;
    settings = {
      CPU_SCALING_GOVERNOR_ON_AC = "performance";
      CPU_SCALING_GOVERNOR_ON_BAT = "powersave";
    };
  };

  # Enable Nix flakes permanently
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # Garbage collection
  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 14d";
  };

  system.stateVersion = "25.05";
}
```

### 3.4 modules/hyprland.nix

```nix
{ config, pkgs, ... }:

{
  # Enable Hyprland
  programs.hyprland = {
    enable = true;
    withUWSM = true;   # Recommended systemd integration
    xwayland.enable = true;
  };

  # Display manager — greetd with tuigreet for a clean TTY login
  services.greetd = {
    enable = true;
    settings = {
      default_session = {
        command = "${pkgs.greetd.tuigreet}/bin/tuigreet --time --remember --cmd Hyprland";
        user = "greeter";
      };
    };
  };

  # Wayland session packages
  environment.systemPackages = with pkgs; [
    waybar             # Status bar
    wofi               # App launcher
    hyprpaper          # Wallpaper
    hypridle           # Idle daemon
    hyprlock           # Screen lock
    wl-clipboard       # Clipboard
    grim               # Screenshot
    slurp              # Region selection
    swaynotificationcenter  # Notification daemon
    brightnessctl      # Backlight control
    pamixer            # Audio control CLI
    networkmanagerapplet    # Wi-Fi tray
  ];

  # XDG portal for screen sharing, file dialogs, etc.
  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
  };

  # Environment variables for Wayland
  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";          # Hint Electron/Chromium to use Wayland
    WLR_NO_HARDWARE_CURSORS = "1";  # Fix cursor on some Intel GPUs
    XDG_CURRENT_DESKTOP = "Hyprland";
    XDG_SESSION_TYPE = "wayland";
    XDG_SESSION_DESKTOP = "Hyprland";
  };
}
```

### 3.5 modules/terminal.nix

```nix
{ pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    kitty
  ];
}
```

### 3.6 modules/editor.nix

```nix
{ pkgs, pkgs-unstable, ... }:

{
  environment.systemPackages = with pkgs; [
    # Neovim (use unstable for latest)
    pkgs-unstable.neovim

    # LSP servers
    gopls                    # Go LSP
    go-tools                 # goimports, etc.
    delve                    # Go debugger
    nodePackages.typescript-language-server  # TypeScript LSP
    nodePackages.vscode-langservers-extracted  # HTML/CSS/JSON LSP
    lua-language-server      # Lua LSP (for Neovim config)
    nil                      # Nix LSP

    # Treesitter build dependencies
    gcc
    tree-sitter

    # Supporting tools
    nodejs_22
    go
  ];
}
```

### 3.7 modules/browser.nix

```nix
{ pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    ungoogled-chromium
  ];
}
```

### 3.8 modules/dev-tools.nix

```nix
{ pkgs, pkgs-unstable, ... }:

{
  # Docker
  virtualisation.docker = {
    enable = true;
    enableOnBoot = true;
  };

  environment.systemPackages = with pkgs; [
    # Git
    git
    lazygit
    gh                      # GitHub CLI
    delta                   # Better git diff

    # Docker tools
    docker-compose
    lazydocker

    # Go toolchain
    go
    golangci-lint
    gotools                 # goimports, gorename, etc.

    # Node/TypeScript toolchain
    nodejs_22
    nodePackages.pnpm
    nodePackages.typescript

    # Build tools
    gnumake
    cmake
    pkg-config

    # System introspection (needed for the daemon later)
    inotify-tools
    sqlite
    lsof
    strace
  ];
}
```

### 3.9 modules/fonts.nix

```nix
{ pkgs, ... }:

{
  fonts = {
    enableDefaultPackages = true;
    packages = with pkgs; [
      ibm-plex               # IBM Plex Mono — Aether's primary typeface
      nerd-fonts.jetbrains-mono  # Fallback with icon support
      noto-fonts
      noto-fonts-cjk-sans
      noto-fonts-emoji
    ];
    fontconfig.defaultFonts = {
      monospace = [ "IBM Plex Mono" "JetBrainsMono Nerd Font" ];
      sansSerif = [ "IBM Plex Sans" "Noto Sans" ];
    };
  };
}
```

### 3.10 hosts/macbook/default.nix

```nix
{ config, pkgs, ... }:

{
  imports = [
    ./hardware.nix
  ];

  # MacBook-specific tweaks
  # Improve trackpad behavior
  services.libinput = {
    enable = true;
    touchpad = {
      naturalScrolling = true;
      tapping = true;
      clickMethod = "clickfinger";
      disableWhileTyping = true;
    };
  };

  # Better Intel GPU support
  hardware.graphics = {
    enable = true;
  };
}
```

**hosts/macbook/hardware.nix** — paste the output of `nixos-generate-config` here. It will include your specific filesystem UUIDs, kernel modules, and hardware detection.

---

## Part 4: Home Manager Configs (User-Level)

### 4.1 home/default.nix

```nix
{ config, pkgs, ... }:

{
  imports = [
    ./hyprland.nix
    ./kitty.nix
    ./neovim.nix
    ./git.nix
    ./shell.nix
  ];

  home.username = "nick";
  home.homeDirectory = "/home/nick";
  home.stateVersion = "25.05";
  programs.home-manager.enable = true;
}
```

### 4.2 home/hyprland.nix

```nix
{ config, pkgs, ... }:

{
  wayland.windowManager.hyprland = {
    enable = true;
    systemd.enable = false;  # Using UWSM instead

    settings = {
      # Monitor config (adjust for your display)
      monitor = [ ",preferred,auto,1" ];

      # General
      general = {
        gaps_in = 4;
        gaps_out = 8;
        border_size = 2;
        "col.active_border" = "rgb(7c6fea)";    # Aether violet
        "col.inactive_border" = "rgb(1e1e2e)";
        layout = "dwindle";
      };

      # Decoration
      decoration = {
        rounding = 6;
        blur = {
          enabled = true;
          size = 3;
          passes = 1;
        };
        shadow = {
          enabled = false;
        };
      };

      # Animations — subtle, not distracting
      animations = {
        enabled = true;
        bezier = [ "ease, 0.25, 0.1, 0.25, 1" ];
        animation = [
          "windows, 1, 3, ease"
          "windowsOut, 1, 3, ease"
          "fade, 1, 3, ease"
          "workspaces, 1, 3, ease"
        ];
      };

      # Input
      input = {
        kb_layout = "us";
        follow_mouse = 1;
        touchpad = {
          natural_scroll = true;
        };
      };

      # Dwindle layout
      dwindle = {
        pseudotile = true;
        preserve_split = true;
      };

      # Key bindings
      "$mod" = "SUPER";
      bind = [
        # Core
        "$mod, Return, exec, kitty"
        "$mod, Q, killactive"
        "$mod, M, exit"
        "$mod, V, togglefloating"
        "$mod, D, exec, wofi --show drun"
        "$mod, F, fullscreen"
        "$mod, P, pseudo"
        "$mod, S, togglesplit"

        # Focus
        "$mod, H, movefocus, l"
        "$mod, L, movefocus, r"
        "$mod, K, movefocus, u"
        "$mod, J, movefocus, d"

        # Move windows
        "$mod SHIFT, H, movewindow, l"
        "$mod SHIFT, L, movewindow, r"
        "$mod SHIFT, K, movewindow, u"
        "$mod SHIFT, J, movewindow, d"

        # Workspaces
        "$mod, 1, workspace, 1"
        "$mod, 2, workspace, 2"
        "$mod, 3, workspace, 3"
        "$mod, 4, workspace, 4"
        "$mod, 5, workspace, 5"

        # Move to workspace
        "$mod SHIFT, 1, movetoworkspace, 1"
        "$mod SHIFT, 2, movetoworkspace, 2"
        "$mod SHIFT, 3, movetoworkspace, 3"
        "$mod SHIFT, 4, movetoworkspace, 4"
        "$mod SHIFT, 5, movetoworkspace, 5"

        # Screenshot
        "$mod, Print, exec, grim -g \"$(slurp)\" - | wl-copy"

        # Lock
        "$mod SHIFT, X, exec, hyprlock"
      ];

      # Mouse bindings
      bindm = [
        "$mod, mouse:272, movewindow"
        "$mod, mouse:273, resizewindow"
      ];

      # Startup
      exec-once = [
        "waybar"
        "hyprpaper"
        "swaync"
        "nm-applet --indicator"
      ];
    };
  };
}
```

### 4.3 home/kitty.nix

```nix
{ ... }:

{
  programs.kitty = {
    enable = true;
    settings = {
      # Font
      font_family = "IBM Plex Mono";
      bold_font = "IBM Plex Mono Bold";
      font_size = 13;

      # Aether color scheme
      background = "#0e0e14";
      foreground = "#c8c8d8";
      cursor = "#7c6fea";
      cursor_text_color = "#0e0e14";
      selection_background = "#2a2a3a";
      selection_foreground = "#e8e8f0";

      # 16 colors
      color0 = "#1a1a24";     # black
      color1 = "#f78c6c";     # red
      color2 = "#c3e88d";     # green
      color3 = "#ffcb6b";     # yellow
      color4 = "#82aaff";     # blue
      color5 = "#c792ea";     # magenta
      color6 = "#89ddff";     # cyan
      color7 = "#b8b8c8";     # white
      color8 = "#4a4a5a";     # bright black
      color9 = "#ff8b6a";     # bright red
      color10 = "#d4f09e";    # bright green
      color11 = "#ffd68a";    # bright yellow
      color12 = "#94b8ff";    # bright blue
      color13 = "#d4a4f5";    # bright magenta
      color14 = "#a0e8ff";    # bright cyan
      color15 = "#e8e8f0";    # bright white

      # Window
      window_padding_width = 8;
      hide_window_decorations = "yes";
      confirm_os_window_close = 0;

      # Scrollback
      scrollback_lines = 10000;

      # Bell
      enable_audio_bell = "no";

      # Tab bar
      tab_bar_style = "powerline";
      tab_powerline_style = "slanted";
    };
  };
}
```

### 4.4 home/neovim.nix

```nix
{ pkgs, ... }:

{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;

    # For Phase 0 we use a minimal but functional config.
    # This gives you LSP, treesitter, telescope, and a file tree.
    # You can replace this with your own init.lua later.
    extraLuaConfig = ''
      -- Leader key
      vim.g.mapleader = " "
      vim.g.maplocalleader = " "

      -- Core options
      vim.opt.number = true
      vim.opt.relativenumber = true
      vim.opt.signcolumn = "yes"
      vim.opt.tabstop = 4
      vim.opt.shiftwidth = 4
      vim.opt.expandtab = true
      vim.opt.smartindent = true
      vim.opt.wrap = false
      vim.opt.scrolloff = 8
      vim.opt.termguicolors = true
      vim.opt.updatetime = 250
      vim.opt.clipboard = "unnamedplus"
      vim.opt.undofile = true
      vim.opt.ignorecase = true
      vim.opt.smartcase = true

      -- Aether colorscheme (minimal, matches Kitty)
      vim.cmd([[
        highlight Normal guibg=#0e0e14 guifg=#c8c8d8
        highlight NormalFloat guibg=#16161e
        highlight CursorLine guibg=#1a1a24
        highlight Visual guibg=#2a2a3a
        highlight Comment guifg=#4a4a5a gui=italic
        highlight String guifg=#c3e88d
        highlight Keyword guifg=#c792ea
        highlight Function guifg=#82aaff
        highlight Number guifg=#f78c6c
        highlight Type guifg=#89ddff
        highlight LineNr guifg=#2a2a3a
        highlight CursorLineNr guifg=#7c6fea
        highlight StatusLine guibg=#16161e guifg=#6a6a7a
        highlight Pmenu guibg=#16161e guifg=#b8b8c8
        highlight PmenuSel guibg=#7c6fea guifg=#e8e8f0
        highlight DiagnosticError guifg=#f78c6c
        highlight DiagnosticWarn guifg=#ffcb6b
        highlight DiagnosticHint guifg=#82aaff
      ]])
    '';

    plugins = with pkgs.vimPlugins; [
      # Treesitter
      {
        plugin = nvim-treesitter.withPlugins (p: [
          p.go p.gomod p.gosum
          p.typescript p.tsx p.javascript
          p.nix p.lua p.json p.yaml p.toml p.markdown
          p.bash p.dockerfile p.sql
          p.html p.css
        ]);
        type = "lua";
        config = ''
          require("nvim-treesitter.configs").setup({
            highlight = { enable = true },
            indent = { enable = true },
          })
        '';
      }

      # LSP
      {
        plugin = nvim-lspconfig;
        type = "lua";
        config = ''
          local lsp = require("lspconfig")
          local on_attach = function(_, bufnr)
            local opts = { buffer = bufnr }
            vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
            vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)
            vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
            vim.keymap.set("n", "rn", vim.lsp.buf.rename, opts)
            vim.keymap.set("n", "ca", vim.lsp.buf.code_action, opts)
            vim.keymap.set("n", "f", function() vim.lsp.buf.format({ async = true }) end, opts)
            vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
            vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
          end

          lsp.gopls.setup({ on_attach = on_attach })
          lsp.ts_ls.setup({ on_attach = on_attach })
          lsp.nil_ls.setup({ on_attach = on_attach })
          lsp.lua_ls.setup({
            on_attach = on_attach,
            settings = { Lua = { diagnostics = { globals = { "vim" } } } },
          })
        '';
      }

      # Autocompletion
      nvim-cmp
      cmp-nvim-lsp
      cmp-buffer
      cmp-path
      {
        plugin = luasnip;
        type = "lua";
        config = ''
          local cmp = require("cmp")
          cmp.setup({
            snippet = {
              expand = function(args)
                require("luasnip").lsp_expand(args.body)
              end,
            },
            mapping = cmp.mapping.preset.insert({
              [""] = cmp.mapping.complete(),
              [""] = cmp.mapping.confirm({ select = true }),
              [""] = cmp.mapping.select_next_item(),
              [""] = cmp.mapping.select_prev_item(),
            }),
            sources = {
              { name = "nvim_lsp" },
              { name = "buffer" },
              { name = "path" },
            },
          })
        '';
      }

      # Telescope (fuzzy finder)
      plenary-nvim
      {
        plugin = telescope-nvim;
        type = "lua";
        config = ''
          local telescope = require("telescope.builtin")
          vim.keymap.set("n", "ff", telescope.find_files)
          vim.keymap.set("n", "fg", telescope.live_grep)
          vim.keymap.set("n", "fb", telescope.buffers)
          vim.keymap.set("n", "fh", telescope.help_tags)
        '';
      }

      # File tree
      nvim-web-devicons
      {
        plugin = nvim-tree-lua;
        type = "lua";
        config = ''
          require("nvim-tree").setup({})
          vim.keymap.set("n", "e", ":NvimTreeToggle")
        '';
      }

      # Status line
      {
        plugin = lualine-nvim;
        type = "lua";
        config = ''
          require("lualine").setup({
            options = {
              theme = {
                normal = {
                  a = { bg = "#7c6fea", fg = "#0e0e14", gui = "bold" },
                  b = { bg = "#1a1a24", fg = "#b8b8c8" },
                  c = { bg = "#12121a", fg = "#6a6a7a" },
                },
                insert = { a = { bg = "#c3e88d", fg = "#0e0e14", gui = "bold" } },
                visual = { a = { bg = "#c792ea", fg = "#0e0e14", gui = "bold" } },
                command = { a = { bg = "#f78c6c", fg = "#0e0e14", gui = "bold" } },
                inactive = {
                  a = { bg = "#12121a", fg = "#4a4a5a" },
                  b = { bg = "#12121a", fg = "#4a4a5a" },
                  c = { bg = "#12121a", fg = "#4a4a5a" },
                },
              },
              component_separators = { left = "", right = "" },
              section_separators = { left = "", right = "" },
            },
          })
        '';
      }

      # Quality of life
      {
        plugin = gitsigns-nvim;
        type = "lua";
        config = ''require("gitsigns").setup()'';
      }
      {
        plugin = comment-nvim;
        type = "lua";
        config = ''require("Comment").setup()'';
      }
      {
        plugin = indent-blankline-nvim;
        type = "lua";
        config = ''require("ibl").setup({ indent = { char = "│" } })'';
      }
      vim-sleuth  # Auto-detect indent
    ];
  };
}
```

### 4.5 home/git.nix

```nix
{ ... }:

{
  programs.git = {
    enable = true;
    userName = "Nick";          # Change to your name
    userEmail = "nick@example.com";  # Change to your email
    delta = {
      enable = true;
      options = {
        navigate = true;
        line-numbers = true;
        syntax-theme = "base16";
      };
    };
    extraConfig = {
      init.defaultBranch = "main";
      push.autoSetupRemote = true;
      pull.rebase = true;
      core.editor = "nvim";
    };
  };

  programs.lazygit = {
    enable = true;
    settings = {
      gui.theme = {
        activeBorderColor = [ "#7c6fea" "bold" ];
        inactiveBorderColor = [ "#4a4a5a" ];
        selectedLineBgColor = [ "#1a1a24" ];
      };
    };
  };
}
```

### 4.6 home/shell.nix

```nix
{ pkgs, ... }:

{
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    history = {
      size = 50000;
      save = 50000;
    };
    shellAliases = {
      # System
      rebuild = "sudo nixos-rebuild switch --flake ~/aether#aether";
      update = "nix flake update ~/aether";

      # Navigation
      ll = "ls -la";
      ".." = "cd ..";
      "..." = "cd ../..";

      # Git
      gs = "git status";
      gc = "git commit";
      gp = "git push";
      gl = "git log --oneline -20";
      lg = "lazygit";

      # Docker
      dc = "docker compose";
      ld = "lazydocker";

      # Dev
      v = "nvim";
      t = "tree -L 2";
    };
  };

  programs.starship = {
    enable = true;
    settings = {
      format = "$directory$git_branch$git_status$golang$nodejs$nix_shell$character";
      character = {
        success_symbol = "[→](bold #7c6fea)";
        error_symbol = "[→](bold #f78c6c)";
      };
      directory = {
        style = "bold #82aaff";
        truncation_length = 3;
      };
      git_branch = {
        style = "bold #c792ea";
        format = "[$branch]($style) ";
      };
      git_status = {
        style = "#f78c6c";
      };
      golang.style = "#89ddff";
      nodejs.style = "#c3e88d";
    };
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
    defaultOptions = [
      "--color=bg+:#1a1a24,bg:#0e0e14,spinner:#7c6fea,hl:#82aaff"
      "--color=fg:#b8b8c8,header:#82aaff,info:#c792ea,pointer:#7c6fea"
      "--color=marker:#c3e88d,fg+:#e8e8f0,prompt:#c792ea,hl+:#82aaff"
    ];
  };

  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };
}
```

---

## Part 5: Installation

Once you've created all the files above (either on the target machine at `/mnt/etc/aether/` during install, or on a USB drive / git repo you can clone):

```bash
# From the live installer, with /mnt mounted:

# Clone or copy the aether flake to the target
sudo mkdir -p /mnt/home/nick/aether
# (copy your files here, or git clone if you've pushed to a repo)

# Also put a copy in /mnt/etc/nixos/ for initial build
sudo cp -r /mnt/home/nick/aether/* /mnt/etc/nixos/

# Don't forget to paste your hardware-configuration.nix into
# /mnt/home/nick/aether/hosts/macbook/hardware.nix

# Install
sudo nixos-install --flake /mnt/home/nick/aether#aether

# Set the root password when prompted
# Reboot
sudo reboot
```

After reboot, log in via tuigreet, and you should land in Hyprland. Press `SUPER+Return` for a Kitty terminal.

```bash
# Verify everything works
nvim --version          # Should show 0.10+
go version              # Should show 1.22+
node --version          # Should show 22+
lazygit --version
docker --version
```

---

## Part 6: The Daemon Scaffold

Don't build the full daemon yet. Scaffold the project structure so it's ready for Phase 1. This is what the engineer starts coding on Monday.

### 6.1 Initialize the Go module

```bash
mkdir -p ~/aether/daemon
cd ~/aether/daemon
go mod init github.com/aether-os/aetherd
```

### 6.2 cmd/aetherd/main.go

```go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	// These will be implemented in Phase 1
	// "github.com/aether-os/aetherd/internal/collector"
	// "github.com/aether-os/aetherd/internal/analyzer"
	// "github.com/aether-os/aetherd/internal/actuator"
	// "github.com/aether-os/aetherd/internal/store"
)

func main() {
	log.SetPrefix("aetherd: ")
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Println("starting aether daemon")

	// Phase 1: Initialize store
	// db, err := store.Open(store.DefaultPath())

	// Phase 1: Start collector
	// go collector.Run(ctx, db, collector.DefaultConfig())

	// Phase 1: Start analyzer
	// go analyzer.Run(ctx, db, analyzer.DefaultConfig())

	// Phase 1: Start actuator
	// go actuator.Run(ctx, actuator.DefaultConfig())

	// Phase 1: Start Unix socket server
	// go ipc.Serve(ctx, "/run/user/$UID/aetherd.sock")

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		log.Printf("received %s, shutting down", s)
		cancel()
	case <-ctx.Done():
	}

	log.Println("shutdown complete")
}
```

### 6.3 cmd/aetherctl/main.go

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("aetherctl — query and control the aether daemon")
		fmt.Println()
		fmt.Println("Usage: aetherctl ")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  status      Show daemon status")
		fmt.Println("  files       Show most-touched files today")
		fmt.Println("  commands    Show command frequency")
		fmt.Println("  patterns    Show detected patterns")
		fmt.Println("  summary     Trigger an LLM summary now")
		os.Exit(0)
	}

	switch os.Args[1] {
	case "status":
		fmt.Println("aetherd: not yet implemented")
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
```

### 6.4 internal/store/store.go

```go
package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// DefaultPath returns ~/.local/share/aether/events.db
func DefaultPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", "aether", "events.db")
}

// DB wraps a SQLite connection with Aether-specific operations.
type DB struct {
	conn *sql.DB
}

// Open creates or opens the Aether event store.
func Open(path string) (*DB, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	conn, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (db *DB) migrate() error {
	_, err := db.conn.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			source     TEXT    NOT NULL,  -- 'fs', 'proc', 'hyprland', 'git', 'terminal', 'ai'
			kind       TEXT    NOT NULL,  -- 'file_open', 'window_focus', 'command', etc.
			context    TEXT,              -- JSON blob with event-specific data
			metadata   TEXT               -- JSON blob for extra info
		);
		CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
		CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
		CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
	`)
	return err
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.conn.Close()
}
```

### 6.5 internal/collector/collector.go

```go
package collector

// This file is the scaffold for Phase 1.
// The collector watches OS-level event sources and writes to the store.
//
// Data sources to implement:
//   - fsnotify:  File system events (which files, when, how often)
//   - /proc:     Process lifecycle, resource usage
//   - hyprland:  Window focus, workspace switches (via IPC socket)
//   - git:       Commit cadence, branch activity (via .git fs watching)
//   - terminal:  Command history (via shell integration, not keylogging)
//
// Architecture:
//   Each source runs in its own goroutine.
//   All sources write to the shared store via store.DB.
//   The collector.Run() function starts all sources and blocks until ctx is done.
```

### 6.6 internal/analyzer/analyzer.go

```go
package analyzer

// This file is the scaffold for Phase 1–2.
// The analyzer consumes the event stream and produces insights.
//
// Two tiers:
//   Local:  Frequency tables, pattern detection (pure Go, no external deps)
//   LLM:    Periodic batch summaries via the inference API
//
// Local patterns to detect:
//   - File access frequency (top files per day/week)
//   - Command frequency (most-run terminal commands)
//   - Temporal patterns (productive hours, context-switch frequency)
//   - Build success/failure rates
//   - AI interaction metrics (query categories, acceptance rates)
//
// LLM tier:
//   - Hourly or on-demand summary of recent activity
//   - Sends summarized context (never raw events) to inference endpoint
//   - Response displayed via actuator (notification or shell suggestion)
```

### 6.7 internal/actuator/actuator.go

```go
package actuator

// This file is the scaffold for Phase 2–3.
// The actuator takes insights from the analyzer and changes the environment.
//
// Passive (always on):
//   - D-Bus desktop notifications
//   - Feed the shell's suggestion bar (via Unix socket to the shell)
//
// Active (opt-in):
//   - Hyprland layout reconfiguration (via IPC socket)
//   - Docker container pre-warming
//   - Keybinding profile switching
//
// All active actions are reversible (undo system).
```

### 6.8 aetherd.service (systemd unit)

```ini
[Unit]
Description=Aether OS Daemon
After=network.target graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=%h/.local/bin/aetherd
Restart=on-failure
RestartSec=5
Environment=HOME=%h

# Resource limits
MemoryMax=100M
CPUQuota=10%

[Install]
WantedBy=default.target
```

---

## Part 7: Day 1 Checklist

Use this as a literal checklist for the first working session.

**Morning — ISO & Install**

- [ ] Build the custom ISO (on a build machine with Nix)
- [ ] Flash to USB drive
- [ ] Boot the MacBook, hold ⌥, select EFI boot
- [ ] Verify Wi-Fi works in live environment (`nmcli`)
- [ ] Partition the disk (EFI + swap + root)
- [ ] Format partitions
- [ ] Mount and run `nixos-generate-config`
- [ ] Save hardware-configuration.nix content

**Afternoon — Flake & First Boot**

- [ ] Create the aether repo (or clone from wherever you staged it)
- [ ] Paste hardware-configuration.nix into hosts/macbook/hardware.nix
- [ ] Update user details in base.nix and git.nix
- [ ] Run `nixos-install --flake .#aether`
- [ ] Reboot, log in via tuigreet, land in Hyprland
- [ ] Verify: Kitty opens (SUPER+Return)
- [ ] Verify: Neovim opens with syntax highlighting (`nvim test.go`)
- [ ] Verify: Go LSP works (`gopls` autocomplete in a .go file)
- [ ] Verify: TypeScript LSP works
- [ ] Verify: lazygit works in a git repo
- [ ] Verify: Docker runs (`docker run hello-world`)
- [ ] Verify: ungoogled-chromium opens
- [ ] Verify: Wi-Fi connected via NetworkManager
- [ ] Verify: Sound works (pipewire)

**Evening — Daemon Scaffold**

- [ ] `go mod init` the daemon project
- [ ] Create the directory structure (cmd/, internal/)
- [ ] Write the scaffold files (main.go, store.go, etc.)
- [ ] `go mod tidy` — ensure it compiles
- [ ] `go build ./cmd/aetherd` — verify binary builds
- [ ] Copy the systemd unit to `~/.config/systemd/user/`
- [ ] `systemctl --user enable --now aetherd` (it'll start and immediately idle, which is fine)
- [ ] Commit everything to git, push to remote
- [ ] You now have a reproducible developer OS with the daemon ready to build

---

## Part 8: Phase 1 Priorities (Next Week)

Once Phase 0 is solid, here's the order to build the daemon subsystems:

1. **Store first.** Get SQLite working with the schema. Write Insert and Query methods. Write tests.

2. **File system collector second.** Use `github.com/fsnotify/fsnotify` to watch ~/code (or wherever your projects live). Log file open/modify/create events to the store. This is the simplest collector and gives you immediate data.

3. **Hyprland IPC collector third.** Connect to Hyprland's Unix socket (at `$XDG_RUNTIME_DIR/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock`). Subscribe to `activewindow` and `workspace` events. Log window focus durations and workspace switches.

4. **aetherctl query commands.** Implement `aetherctl files` (top files by event count today) and `aetherctl status` (daemon uptime, event count, memory usage). This gives you a feedback loop — you can see what the daemon is collecting.

5. **LLM summary.** Implement the hourly summary: query the store for the last hour's events, construct a prompt, send it to the inference API (use the Claude API directly for now via `ANTHROPIC_API_KEY`), and display the response as a D-Bus notification (`notify-send`).

6. **Unix socket server.** Implement the IPC server that the shell will later connect to. For now, `aetherctl` is the client. Protocol: newline-delimited JSON over a Unix domain socket.

Each of these is a half-day to one-day task. By end of week, you should have a daemon that watches your files and windows, stores events, answers queries via CLI, and sends you a daily AI summary of your workflow.