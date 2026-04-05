{ config, pkgs, lib, ... }:

let
  cfg = config.sigil.dev;
in {
  options.sigil.dev = {
    enable = lib.mkEnableOption "Sigil development workstation tools";
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = with pkgs; [
      # Rust toolchain (manages stable/nightly via rustup)
      rustup

      # Python
      python312
      python312Packages.pip
      python312Packages.virtualenv

      # Tauri 2.x system dependencies
      pkg-config
      gtk3
      webkitgtk_4_1
      libsoup_3
      openssl
      glib
      cairo
      pango
      gdk-pixbuf
      atk

      # GitHub CLI
      gh

      # Browser
      firefox

      # Terminal multiplexer
      tmux

      # Additional dev tools
      tree
      wget
      curl
      unzip
      file
      man-pages
      man-pages-posix

      # Battery monitoring
      acpi

      # Language servers (for Monaco LSP integration)
      gopls
      rust-analyzer
      pyright
      nodePackages.typescript-language-server
      nil  # Nix LSP
    ];

    # direnv + nix-direnv for per-project dev shells
    programs.direnv = {
      enable = true;
      nix-direnv.enable = true;
    };

    # TLP for battery optimization (complements thermald in mbp-2017.nix)
    services.tlp = {
      enable = true;
      settings = {
        CPU_SCALING_GOVERNOR_ON_BAT = "powersave";
        CPU_SCALING_GOVERNOR_ON_AC = "performance";
        CPU_ENERGY_PERF_POLICY_ON_BAT = "power";
        CPU_ENERGY_PERF_POLICY_ON_AC = "performance";
        WIFI_PWR_ON_BAT = "on";
        WIFI_PWR_ON_AC = "off";
      };
    };

    # Low-battery action
    services.upower = {
      enable = true;
      criticalPowerAction = "HybridSleep";
    };

    # Automatic Nix store garbage collection (weekly)
    nix.gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 14d";
    };

    # PATH additions for user-installed tools (rustup, pip --user, etc.)
    # GOPRIVATE ensures `go get` doesn't hit the public proxy for sigil-tech repos.
    # Auth via ~/.netrc (created manually: `gh auth setup-git` or add machine entry).
    environment.extraInit = ''
      export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
      export GOPRIVATE="github.com/sigil-tech/*"
      export GONOSUMDB="github.com/sigil-tech/*"
    '';
  };
}
