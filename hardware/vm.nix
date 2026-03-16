# Hardware configuration for QEMU/KVM virtual machine testing
{ config, pkgs, lib, ... }:

{
  # Use NixOS virtualisation module for proper QEMU VM support
  virtualisation = {
    memorySize = 4096;
    cores = 2;
    graphics = false;
    forwardPorts = [
      { from = "host"; host.port = 2222; guest.port = 22; }
    ];
    # Disk size for the VM root
    diskSize = 20480; # 20GB
  };

  # Networking — QEMU user-mode networking
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = lib.mkForce false;
  networking.useDHCP = true;

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
