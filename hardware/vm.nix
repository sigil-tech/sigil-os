# Hardware configuration for QEMU/KVM virtual machine testing
{ config, pkgs, lib, ... }:

{
  # Boot loader
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Virtio drivers for QEMU
  boot.initrd.availableKernelModules = [
    "virtio_pci" "virtio_blk" "virtio_scsi" "virtio_net"
    "ahci" "xhci_pci" "sr_mod"
  ];

  # Root filesystem — uses a virtual disk
  fileSystems."/" = {
    device = "/dev/vda1";
    fsType = "ext4";
  };

  # No swap in VM
  swapDevices = [];

  # Networking — QEMU user-mode networking
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = lib.mkForce false;
  networking.useDHCP = true;

  # Sound — not needed in VM
  # Graphics — virtio-gpu
  hardware.graphics.enable = true;

  # Auto-login for quick testing
  users.users.engineer.initialPassword = "";

  # Enable SSH so you can connect from the host
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = lib.mkForce "yes";
    settings.PermitEmptyPasswords = "yes";
  };
  users.users.root.initialPassword = "";
}
