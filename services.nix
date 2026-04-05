# Shared service configuration for sigild on real/installed systems
# Used by both the ISO and the installed MBP config
{ config, pkgs, lib, sigild, ... }:

{
  imports = lib.optional (builtins.pathExists ./secrets.nix) ./secrets.nix;

  # Enable Sigil services
  services.sigild = {
    enable = true;
    logLevel = "debug";
    watchDirs = [ "~/workspace" ];
    repoDirs = [ "~/workspace" ];
    inference = {
      mode = "remote";
      local.enable = false;
      cloud = {
        enable = true;
        provider = "anthropic";
        apiKeyFile = "/etc/sigil/cloud-api-key.env";
      };
    };
    network = {
      enable = true;
      bind = "0.0.0.0";
      port = 7773;
    };
  };

  services.sigil-shell.enable = true;
  services.sigil-plymouth.enable = true;
  services.sigil-inference.enable = true;
  sigil.tools.enable = true;
  sigil.dev.enable = true;

  # Auto-create workspace and Tauri data directories
  system.activationScripts.workspace = ''
    for u in /home/*; do
      user=$(basename "''$u")
      mkdir -p "''$u/workspace"
      mkdir -p "''$u/.local/share/dev.sigil.shell"
      chown -R "''$user:users" "''$u/workspace"
      chown -R "''$user:users" "''$u/.local/share/dev.sigil.shell"
    done
  '';

  # Set a blank password for the engineer user
  users.users.engineer.initialPassword = "";
}
