{ config, pkgs, lib, ... }:
{
  # System basics
  networking.hostName = "sigil";
  time.timeZone = "UTC";

  # Essential developer packages
  environment.systemPackages = with pkgs; [
    git
    neovim
    docker
    lazygit
    ripgrep
    fd
    jq
    htop
    go
    nodejs
    rustup
  ];

  # Docker
  virtualisation.docker.enable = true;

  # User
  users.users.engineer = {
    isNormalUser = true;
    extraGroups = [ "wheel" "docker" "video" "audio" ];
    shell = pkgs.zsh;
  };

  # Zsh
  programs.zsh.enable = true;

  # Allow unfree (for broadcom, etc.)
  nixpkgs.config.allowUnfree = true;

  system.stateVersion = "25.05";
}
