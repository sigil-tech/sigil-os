{ config, pkgs, lib, ... }:
{
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

  # Users
  users.users.nick = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" "networkmanager" ];
    shell = pkgs.zsh;
    initialPassword = "sigil";  # change after first login with `passwd`
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIClrBxfIkR6PSu6sPkpRLApJtH2pjYNkd/2tNvCFQkI7 nick"
    ];
  };

  users.users.engineer = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" "networkmanager" ];
    shell = pkgs.zsh;
  };

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
}
