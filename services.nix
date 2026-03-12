# Shared service configuration for sigild on real/installed systems
# Used by both the ISO and the installed MBP config
{ config, pkgs, lib, sigild, ... }:

{
  imports = lib.optional (builtins.pathExists ./secrets.nix) ./secrets.nix;

  # Enable Sigil services
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

  # Auto-create workspace directory
  system.activationScripts.workspace = ''
    mkdir -p /home/engineer/workspace
    chown engineer:users /home/engineer/workspace
  '';

  # Set a blank password for the engineer user
  users.users.engineer.initialPassword = "";
}
