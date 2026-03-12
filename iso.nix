# ISO-specific overrides for live USB boot
{ config, pkgs, lib, sigild, ... }:

{
  imports = [
    ./services.nix
  ];

  # Allow unfree packages
  nixpkgs.config.allowUnfree = lib.mkForce true;

  # 2017 MacBook Pro hardware support (BCM4350 [14e4:43a3])
  # Uses the open-source brcmfmac driver instead of broadcom-sta (wl),
  # which fails with NULL ndev errors on kernel 6.12+.
  boot.kernelModules = [ "brcmfmac" ];
  boot.blacklistedKernelModules = [ "b43" "bcma" "wl" ];
  hardware.enableAllFirmware = true;
  hardware.wirelessRegulatoryDatabase = true;

  # NetworkManager for easy WiFi setup on live boot
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = true;

  # Extra tools useful on the live system
  environment.systemPackages = with pkgs; [
    wget
    parted
    networkmanagerapplet
    pavucontrol
  ];

  # Larger ISO label
  isoImage.isoName = lib.mkForce "sigil-os-live.iso";
}
