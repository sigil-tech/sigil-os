# Hardware configuration for Apple Virtualization Framework (macOS launcher)
# Headless NixOS guest with virtio-fs shared directories and SSH access.
{ config, pkgs, lib, ... }:

{
  # Boot: direct kernel boot via VZLinuxBootLoader (no bootloader needed)
  boot.loader.grub.enable = false;
  boot.initrd.availableKernelModules = [
    "virtio_pci" "virtio_blk" "virtio_net" "virtio_console" "virtiofs"
  ];
  boot.kernelModules = [ "virtiofs" ];

  # Root filesystem — raw disk image provided by the launcher
  fileSystems."/" = {
    device = "/dev/vda";
    fsType = "ext4";
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
  # sound.enable was removed in NixOS 25.05; headless VMs simply have no audio hardware.

  # Smaller image: disable docs
  documentation.enable = false;
  documentation.man.enable = false;
  documentation.nixos.enable = false;
}
