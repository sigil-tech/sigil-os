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
  ];

  # User
  users.users.engineer = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" "networkmanager" ];
    shell = pkgs.zsh;
  };

  # Zsh
  programs.zsh.enable = true;

  # Allow unfree (for broadcom, etc.)
  nixpkgs.config.allowUnfree = lib.mkDefault true;

  system.stateVersion = lib.mkDefault "25.05";
}
