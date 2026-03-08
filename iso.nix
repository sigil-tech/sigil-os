# ISO-specific overrides for live USB boot
{ config, pkgs, lib, sigild, ... }:

{
  # Allow unfree packages (Broadcom WiFi driver)
  nixpkgs.config.allowUnfree = lib.mkForce true;
  nixpkgs.config.permittedInsecurePackages = [
    "broadcom-sta-6.30.223.271-59-6.12.63"
  ];

  # 2017 MacBook Pro hardware support
  boot.kernelModules = [ "wl" ];
  boot.extraModulePackages = [ config.boot.kernelPackages.broadcom_sta ];
  boot.blacklistedKernelModules = [ "b43" "bcma" "brcmfmac" "brcmsmac" ];
  hardware.wirelessRegulatoryDatabase = true;

  # NetworkManager for easy WiFi setup on live boot
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = true;

  # Enable Sigil services on the live system
  services.sigild = {
    enable = true;
    logLevel = "debug";
    watchDirs = [ "/home/engineer/workspace" ];
    repoDirs = [ "/home/engineer/workspace" ];
    inference = {
      mode = "localfirst";
      local.enable = true;
    };
  };

  services.sigil-inference.enable = true;

  # Extra tools useful on the live system
  environment.systemPackages = with pkgs; [
    wget
    parted
    networkmanagerapplet
    pavucontrol
  ];

  # Auto-create workspace directory
  system.activationScripts.workspace = ''
    mkdir -p /home/engineer/workspace
    chown engineer:users /home/engineer/workspace
  '';

  # Set a blank password for the engineer user on the live system
  users.users.engineer.initialPassword = "";

  # Larger ISO label
  isoImage.isoName = lib.mkForce "sigil-os-live.iso";
}
