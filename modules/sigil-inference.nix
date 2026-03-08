{ config, pkgs, lib, ... }:
with lib;
let cfg = config.services.sigil-inference;
in {
  options.services.sigil-inference = {
    enable = mkEnableOption "Sigil local inference engine";

    modelName = mkOption {
      type = types.str;
      default = "lfm2-24b-a2b-q4_k_m";
      description = "Model name to download and use";
    };
  };

  config = mkIf cfg.enable {
    # llama.cpp is available in nixpkgs
    environment.systemPackages = [ pkgs.llama-cpp ];

    # Note: Model download happens at runtime via 'sigilctl model pull'
    # or 'sigild init'. We don't download in the nix build to avoid
    # storing 14GB in the nix store.
  };
}
