{ config, pkgs, lib, ... }:
let
  cfg = config.sigil.users;
in {
  options.sigil.users.enable = lib.mkEnableOption "default Sigil OS user accounts (nick, engineer)";

  config = {
    # System basics
    networking.hostName = lib.mkDefault "sigil";
    time.timeZone = lib.mkDefault "UTC";

    # Essential developer packages
    environment.systemPackages = with pkgs; [
      git
      neovim
      lazygit
      ripgrep
      fd
      jq
      htop
      go
      nodejs
      fontconfig
      libnotify  # provides notify-send for sigild notifications
    ];

    # Docker
    virtualisation.docker.enable = true;

    # Users — gated so the launcher config can define its own
    users.users.nick = lib.mkIf cfg.enable {
      isNormalUser = true;
      extraGroups = [ "wheel" "video" "audio" "networkmanager" "docker" ];
      shell = pkgs.zsh;
      initialPassword = "sigil";  # change after first login with `passwd`
      openssh.authorizedKeys.keys = [
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIClrBxfIkR6PSu6sPkpRLApJtH2pjYNkd/2tNvCFQkI7 nick"
      ];
    };

    users.users.engineer = lib.mkIf cfg.enable {
      isNormalUser = true;
      extraGroups = [ "wheel" "video" "audio" "networkmanager" ];
      shell = pkgs.zsh;
    };

    # Enable default users by default
    sigil.users.enable = lib.mkDefault true;

    # SSH — required for remote deploys from WSL
    services.openssh = {
      enable = true;
      settings = {
        PermitRootLogin = "no";
        PasswordAuthentication = true;  # flip to false once SSH keys are set
      };
    };

    # Zsh
    programs.zsh.enable = true;

    # Allow unfree (for broadcom, etc.)
    nixpkgs.config.allowUnfree = lib.mkDefault true;

    system.stateVersion = lib.mkDefault "25.05";
  };
}
