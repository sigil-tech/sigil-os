# Hardware configuration for 2017 MacBook Pro (MacBookPro14,x)
# Base from nixos-generate-config, with Sigil OS additions.
{ config, pkgs, lib, modulesPath, ... }:

{
  imports = [
    (modulesPath + "/hardware/network/broadcom-43xx.nix")
    (modulesPath + "/installer/scan/not-detected.nix")
  ];

  # Boot loader — EFI with systemd-boot
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  # Boot the latest generation immediately — no menu, no countdown.
  # Hold Space during POST to access the menu for recovery.
  boot.loader.timeout = 0;
  boot.loader.systemd-boot.configurationLimit = 5;
  boot.loader.systemd-boot.consoleMode = "max";
  boot.loader.systemd-boot.editor = false;  # prevent boot entry editing

  # Kernel — use latest for best hardware support
  boot.kernelPackages = pkgs.linuxPackages_latest;

  # Kernel modules (from nixos-generate-config)
  boot.initrd.availableKernelModules = [ "xhci_pci" "nvme" ];
  # i915 loaded early so Plymouth gets a full-resolution KMS framebuffer
  # from its first frame rather than falling back to the EFI GOP resolution.
  boot.initrd.kernelModules = [ "i915" ];
  boot.kernelModules = [ "kvm-intel" ];
  boot.extraModulePackages = [];

  # Broadcom WiFi (BCM4350 [14e4:43a3])
  # Override broadcom-43xx module — use brcmfmac, not broadcom-sta (wl)
  boot.blacklistedKernelModules = [ "b43" "bcma" "wl" ];
  hardware.enableAllFirmware = true;
  hardware.wirelessRegulatoryDatabase = true;

  # Filesystems (from nixos-generate-config)
  fileSystems."/" = {
    device = "/dev/disk/by-uuid/516a7a50-8270-48dc-9c0b-eeb61effccaf";
    fsType = "ext4";
  };
  fileSystems."/boot" = {
    device = "/dev/disk/by-uuid/766D-1A2D";
    fsType = "vfat";
    options = [ "fmask=0022" "dmask=0022" ];
  };
  swapDevices = [];

  # Networking
  networking.wireless.enable = lib.mkForce false;
  networking.networkmanager.enable = true;
  networking.useDHCP = lib.mkDefault true;

  # Keyboard — remap Fn keys, enable function keys by default.
  # quiet + udev/systemd log suppression hide boot text behind the Plymouth splash.
  boot.kernelParams = [
    "hid_apple.fnmode=2"
    "quiet"
    "udev.log_level=3"
    "systemd.show_status=auto"
  ];

  # Power management
  powerManagement.cpuFreqGovernor = "powersave";
  services.thermald.enable = true;

  # Graphics — Intel Iris Plus (KBL GT2)
  hardware.graphics.enable = true;

  # Sound
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };
  security.rtkit.enable = true;

  # Bluetooth
  hardware.bluetooth.enable = true;

  # Platform
  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
  hardware.cpu.intel.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
}
