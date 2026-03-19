{ config, pkgs, lib, ... }:

with lib;
let
  cfg = config.services.sigil-plymouth;
  themePkg = pkgs.callPackage ../pkgs/sigil-plymouth {};
in {
  options.services.sigil-plymouth = {
    enable = mkEnableOption "Sigil OS branded boot splash screen";
  };

  config = mkIf cfg.enable {
    boot.plymouth = {
      enable = true;
      theme = "sigil";
      themePackages = [ themePkg ];
    };

    # systemd initrd starts Plymouth early (before udev finishes) so the
    # splash is visible from the very first frame. Required for clean Plymouth
    # on modern NixOS — the legacy shell-script initrd path starts Plymouth
    # too late and kernel messages appear before the splash.
    boot.initrd.systemd.enable = true;

    # Suppress remaining boot chatter so nothing bleeds through the splash.
    # boot.plymouth.enable already adds "splash" to kernelParams automatically.
    boot.consoleLogLevel = 3;
    boot.initrd.verbose = false;
  };
}
