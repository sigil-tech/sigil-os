# pkgs/make-disk-image.nix
#
# Produces a bootable disk image bundle for a launcher VM NixOS configuration.
#
# For macOS (aarch64-linux): a bare ext4 image with no partition table.
# Apple Virtualization Framework does direct kernel boot via VZLinuxBootLoader
# — no GRUB or EFI partition is needed.  The kernel and initrd are exported
# alongside the disk image so the Swift launcher can point VZLinuxBootLoader
# at them directly.
#
# For Windows (x86_64-linux): a GPT image with an EFI system partition and
# a root ext4 partition.  GRUB (EFI) is installed into the image by
# nixos-install, which is invoked inside a VM by make-disk-image.nix.
# The kernel and initrd are also exported for use by the C# launcher at
# startup before it delegates to GRUB inside the VM.
#
# Usage (from flake.nix):
#
#   import ./pkgs/make-disk-image.nix {
#     inherit pkgs lib;
#     nixosConfig = self.nixosConfigurations.sigil-launcher;
#     platform = "apple-vf";   # or "hyper-v"
#   }
#
# Outputs ($out/):
#   sigil-vm.img   – raw disk image (ext4 or EFI+ext4)
#   vmlinuz        – uncompressed kernel (Image on aarch64, bzImage on x86_64)
#   initrd         – initial ramdisk

{ pkgs
, lib
, nixosConfig
  # "apple-vf" → bare ext4, no bootloader installed
  # "hyper-v"  → GPT + EFI + GRUB
, platform
}:

let
  cfg = nixosConfig.config;

  isAarch64 = pkgs.stdenv.hostPlatform.isAarch64;
  kernelTarget = if isAarch64 then "Image" else "bzImage";

  # Shared make-disk-image parameters
  commonArgs = {
    inherit pkgs lib;
    config = cfg;
    format = "raw";
    name = "sigil-vm-disk";
    baseName = "sigil-vm";
    # Auto-size based on the NixOS closure; add 512 MiB headroom.
    diskSize = "auto";
    additionalSpace = "512M";
    # No channel inside the image — keeps the image hermetic and smaller.
    copyChannel = false;
  };

  # Apple VF: bare ext4, no partition table, no bootloader.
  # VZLinuxBootLoader boots the kernel directly; the image is mounted as /dev/vda.
  appleVFImage = (import "${pkgs.path}/nixos/lib/make-disk-image.nix" (commonArgs // {
    partitionTableType = "none";
    installBootLoader = false;
  }));

  # Hyper-V: GPT with EFI system partition; GRUB installs into the image.
  hyperVImage = (import "${pkgs.path}/nixos/lib/make-disk-image.nix" (commonArgs // {
    partitionTableType = "efi";
    installBootLoader = true;
    # Hyper-V Gen2 expects 256 MiB ESP.
    bootSize = "256M";
  }));

  diskImageDrv = if platform == "apple-vf" then appleVFImage
                 else if platform == "hyper-v" then hyperVImage
                 else throw "make-disk-image: unknown platform '${platform}'; expected 'apple-vf' or 'hyper-v'";

in
pkgs.runCommand "sigil-launcher-image-${platform}" {
  passthru = {
    inherit diskImageDrv;
    kernel = cfg.system.build.kernel;
    initialRamdisk = cfg.system.build.initialRamdisk;
  };
} ''
  mkdir -p $out

  # Disk image — make-disk-image.nix places the raw image at $drv/sigil-vm.img
  cp ${diskImageDrv}/sigil-vm.img $out/sigil-vm.img

  # Kernel
  cp ${cfg.system.build.kernel}/${kernelTarget} $out/vmlinuz

  # Initial ramdisk
  cp ${cfg.system.build.initialRamdisk}/initrd $out/initrd
''
