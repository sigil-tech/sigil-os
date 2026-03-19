# Hardware configuration for Hyper-V (Windows launcher)
# Headless NixOS guest with CIFS shared directories and SSH access.
{ config, pkgs, lib, ... }:

{
  # Boot: GRUB EFI for Gen2 Hyper-V VM
  boot.loader.grub = {
    enable = true;
    efiSupport = true;
    device = "nodev";
    efiInstallAsRemovable = true;
  };
  boot.loader.efi.canTouchEfiVariables = false;

  boot.initrd.availableKernelModules = [
    "hv_vmbus" "hv_storvsc" "hv_netvsc" "hv_utils"
    "sd_mod" "sr_mod" "ahci"
  ];
  boot.kernelModules = [ "hv_vmbus" "hv_storvsc" "hv_netvsc" "hv_utils" ];

  # Hyper-V guest integration services
  virtualisation.hypervGuest.enable = true;

  # Root filesystem — Hyper-V SCSI disk (Gen2)
  fileSystems."/" = {
    device = "/dev/sda2";
    fsType = "ext4";
  };

  # EFI system partition
  fileSystems."/boot/efi" = {
    device = "/dev/sda1";
    fsType = "vfat";
  };

  # CIFS shared directories — mounted from the Windows host via SMB
  # Host IP 10.0.0.1 is the Hyper-V Default Switch gateway.
  fileSystems."/workspace" = {
    device = "//10.0.0.1/sigil-workspace";
    fsType = "cifs";
    options = [
      "defaults" "nofail"
      "x-systemd.automount" "x-systemd.device-timeout=10"
      "username=sigil" "password=sigil"
      "uid=1000" "gid=100"
    ];
  };

  fileSystems."/sigil-profile" = {
    device = "//10.0.0.1/sigil-profile";
    fsType = "cifs";
    options = [
      "defaults" "nofail"
      "x-systemd.automount" "x-systemd.device-timeout=10"
      "username=sigil" "password=sigil"
      "uid=1000" "gid=100"
    ];
  };

  # Ensure CIFS utils are available for mounting
  environment.systemPackages = [ pkgs.cifs-utils ];

  # Networking — DHCP on Hyper-V Default Switch
  networking.useDHCP = true;
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = lib.mkForce false;
  networking.firewall.allowedTCPPorts = [ 22 7773 ];

  # Serial console for Hyper-V
  boot.kernelParams = [
    "console=ttyS0"
    "systemd.log_target=console"
  ];

  # SSH — primary access method from the launcher
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = true;
    };
  };

  # Default VM user — the launcher connects as this user
  users.users.sigil = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    shell = pkgs.zsh;
    initialPassword = "sigil";
    home = "/home/sigil";
  };

  # Headless — no display, no audio
  hardware.graphics.enable = false;
  services.xserver.enable = false;
  sound.enable = false;

  # Smaller image: disable docs
  documentation.enable = false;
  documentation.man.enable = false;
  documentation.nixos.enable = false;
}
