{ config, pkgs, lib, sigild ? null, ... }:
with lib;
let
  cfg = config.services.sigild;
  sigildPkg = if sigild != null then sigild else pkgs.sigild;
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
    # Make sigild and sigilctl available system-wide
    environment.systemPackages = [ sigildPkg ];

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

    # Pre-create data directories so the sandboxed service can write to them
    system.activationScripts.sigildDirs = ''
      install -d -o engineer -g users /home/engineer/.local/share/sigild
      install -d -o engineer -g users /home/engineer/.config/sigil
      install -d -o engineer -g users /home/engineer/.cache/sigil
    '';

    # Systemd user service
    systemd.user.services.sigild = {
      description = "Sigil OS Daemon";
      wantedBy = [ "default.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        ExecStart = "${sigildPkg}/bin/sigild -config /etc/sigil/config.toml";
        Restart = "on-failure";
        RestartSec = 5;

        # Load API key from file if configured (avoids baking secrets into nix store).
        # The file should contain: SIGIL_CLOUD_API_KEY=sk-ant-...
        EnvironmentFile = lib.optional (cfg.inference.cloud.apiKeyFile != null)
          cfg.inference.cloud.apiKeyFile;

        # Security hardening
        ProtectSystem = "strict";
        ProtectHome = "read-only";
        ReadWritePaths = [
          "/home/engineer/.local/share/sigild"
          "/home/engineer/.config/sigil"
          "/home/engineer/.cache/sigil"
          "%t"  # XDG_RUNTIME_DIR — needed for sigild.sock
        ];
        NoNewPrivileges = true;
        PrivateTmp = true;
      };
    };
  };
}
