{ config, pkgs, lib, ... }:

let
  cfg = config.sigil.tools;
in {
  options.sigil.tools = {
    enable = lib.mkEnableOption "Sigil modular tool selection";

    editor = lib.mkOption {
      type = lib.types.enum [ "vscode" "neovim" "both" "none" ];
      default = "vscode";
      description = "Which editor(s) to install system-wide.";
    };

    containerEngine = lib.mkOption {
      type = lib.types.enum [ "docker" "none" ];
      default = "docker";
      description = "Container engine to enable.";
    };

    shell = lib.mkOption {
      type = lib.types.enum [ "zsh" "bash" ];
      default = "zsh";
      description = "Default interactive shell to enable system-wide.";
    };

    notificationLevel = lib.mkOption {
      type = lib.types.int;
      default = 2;
      description = "sigild notification verbosity level (0 = silent, 1 = errors, 2 = normal, 3 = verbose).";
    };
  };

  config = lib.mkIf cfg.enable {
    # Editor packages
    environment.systemPackages =
      lib.optionals (cfg.editor == "vscode" || cfg.editor == "both") [ pkgs.vscode ] ++
      lib.optionals (cfg.editor == "neovim" || cfg.editor == "both") [ pkgs.neovim ];

    # Container engine
    virtualisation.docker.enable = lib.mkIf (cfg.containerEngine == "docker") true;

    # Shell
    programs.zsh.enable  = lib.mkIf (cfg.shell == "zsh")  true;
    programs.bash.enable = lib.mkIf (cfg.shell == "bash") true;
  };
}
