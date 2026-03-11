# ISO-specific overrides for live USB boot
{ config, pkgs, lib, sigild, ... }:

{
  imports = lib.optional (builtins.pathExists ./secrets.nix) ./secrets.nix;

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

  # Enable Sigil services on the live system
  services.sigild = {
    enable = true;
    logLevel = "debug";
    watchDirs = [ "/home/engineer/workspace" ];
    repoDirs = [ "/home/engineer/workspace" ];
    inference = {
      mode = "remote";
      local.enable = false;
      cloud = {
        enable = true;
        provider = "anthropic";
        apiKeyFile = "/etc/sigil/cloud-api-key.env";
      };
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
