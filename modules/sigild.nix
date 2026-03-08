{ config, pkgs, lib, ... }:
with lib;
let cfg = config.services.sigild;
in {
  options.services.sigild = {
    enable = mkEnableOption "Sigil daemon";

    watchDirs = mkOption {
      type = types.listOf types.str;
      default = [];
      description = "Directories to watch for file events";
    };

    repoDirs = mkOption {
      type = types.listOf types.str;
      default = [];
      description = "Git repository roots to watch";
    };

    logLevel = mkOption {
      type = types.enum [ "debug" "info" "warn" "error" ];
      default = "info";
      description = "Log level";
    };

    inference = {
      mode = mkOption {
        type = types.enum [ "local" "localfirst" "remotefirst" "remote" ];
        default = "localfirst";
        description = "Inference routing mode";
      };

      local = {
        enable = mkEnableOption "Local inference via llama-server";
        serverBin = mkOption {
          type = types.str;
          default = "${pkgs.llama-cpp}/bin/llama-server";
          description = "Path to llama-server binary";
        };
        modelPath = mkOption {
          type = types.str;
          default = "";
          description = "Path to GGUF model file";
        };
        ctxSize = mkOption {
          type = types.int;
          default = 4096;
          description = "Context window size";
        };
        gpuLayers = mkOption {
          type = types.int;
          default = 0;
          description = "GPU layers (-1 = auto, 0 = CPU only)";
        };
      };

      cloud = {
        enable = mkEnableOption "Cloud inference fallback";
        provider = mkOption {
          type = types.enum [ "anthropic" "openai" ];
          default = "anthropic";
          description = "Cloud inference provider";
        };
        model = mkOption {
          type = types.str;
          default = "claude-sonnet-4-20250514";
          description = "Cloud model to use";
        };
        apiKeyFile = mkOption {
          type = types.nullOr types.path;
          default = null;
          description = "File containing the API key (avoids storing in nix store)";
        };
      };
    };

    fleet = {
      enable = mkEnableOption "Fleet reporting";
      endpoint = mkOption {
        type = types.str;
        default = "";
        description = "Fleet aggregation layer endpoint URL";
      };
    };
  };

  config = mkIf cfg.enable {
    # Generate config file
    environment.etc."sigil/config.toml".text = ''
      [daemon]
      log_level = "${cfg.logLevel}"
      watch_dirs = [${concatMapStringsSep ", " (d: ''"${d}"'') cfg.watchDirs}]
      repo_dirs = [${concatMapStringsSep ", " (d: ''"${d}"'') cfg.repoDirs}]

      [inference]
      mode = "${cfg.inference.mode}"

      [inference.local]
      enabled = ${boolToString cfg.inference.local.enable}
      server_bin = "${cfg.inference.local.serverBin}"
      model_path = "${cfg.inference.local.modelPath}"
      ctx_size = ${toString cfg.inference.local.ctxSize}
      gpu_layers = ${toString cfg.inference.local.gpuLayers}

      [inference.cloud]
      enabled = ${boolToString cfg.inference.cloud.enable}
      provider = "${cfg.inference.cloud.provider}"
      model = "${cfg.inference.cloud.model}"

      [fleet]
      enabled = ${boolToString cfg.fleet.enable}
      endpoint = "${cfg.fleet.endpoint}"
    '';

    # Systemd user service
    systemd.user.services.sigild = {
      description = "Sigil OS Daemon";
      wantedBy = [ "default.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        ExecStart = "${pkgs.sigild or "/usr/local/bin/sigild"} -config /etc/sigil/config.toml";
        Restart = "on-failure";
        RestartSec = 5;

        # Security hardening
        ProtectSystem = "strict";
        ProtectHome = "read-only";
        ReadWritePaths = [
          "~/.local/share/sigild"
          "~/.config/sigil"
        ];
        NoNewPrivileges = true;
        PrivateTmp = true;
      };
    };
  };
}
