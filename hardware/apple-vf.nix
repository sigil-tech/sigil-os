# Hardware configuration for Apple Virtualization Framework (macOS launcher)
# Supports both Apple Silicon (direct kernel boot) and Intel (UEFI boot).
{ config, pkgs, lib, ... }:

let
  isAarch64 = pkgs.stdenv.hostPlatform.isAarch64;
in {
  # Boot configuration — architecture-dependent
  boot.loader.grub.enable = if isAarch64 then false else true;
  boot.loader.grub.device = lib.mkIf (!isAarch64) "/dev/sda";
  boot.loader.grub.efiSupport = lib.mkIf (!isAarch64) true;
  boot.loader.grub.efiInstallAsRemovable = lib.mkIf (!isAarch64) true;

  boot.initrd.availableKernelModules = [
    "virtio_pci" "virtio_blk" "virtio_net" "virtio_console" "virtiofs"
  ] ++ lib.optionals (!isAarch64) [
    "usb_storage" "uas" "sd_mod" "ahci" "xhci_pci"
  ];
  boot.kernelModules = [ "virtiofs" ];

  # Root filesystem
  # Apple Silicon: virtio block device (/dev/vda)
  # Intel: USB mass storage (/dev/sda1 with EFI at /dev/sda0)
  fileSystems."/" = {
    device = if isAarch64 then "/dev/vda" else "/dev/sda2";
    fsType = "ext4";
  };

  fileSystems."/boot" = lib.mkIf (!isAarch64) {
    device = "/dev/sda1";
    fsType = "vfat";
  };

  # virtio-fs shared directories — mounted by the launcher via VZVirtioFileSystemDeviceConfiguration
  fileSystems."/workspace" = {
    device = "workspace";
    fsType = "virtiofs";
    options = [ "defaults" "nofail" ];
  };

  fileSystems."/sigil-profile" = {
    device = "sigil-profile";
    fsType = "virtiofs";
    options = [ "defaults" "nofail" ];
  };

  # Host-provided GGUF models for local inference
  fileSystems."/sigil-models" = {
    device = "sigil-models";
    fsType = "virtiofs";
    options = [ "ro" "nofail" ];
  };

  # Networking — virtio-net with NAT from the host
  networking.useDHCP = true;
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = lib.mkForce false;
  networking.firewall.allowedTCPPorts = [ 22 7773 ];

  # Serial console for VZVirtioConsoleDeviceConfiguration
  boot.kernelParams = [
    "console=hvc0"
    "systemd.log_target=console"
  ] ++ lib.optionals (!isAarch64) [
    "console=ttyS0"
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

  # Smaller image: disable docs
  documentation.enable = false;
  documentation.man.enable = false;
  documentation.nixos.enable = false;
}
