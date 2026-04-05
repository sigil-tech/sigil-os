{
  description = "Sigil OS — AI-native operating system for software engineers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    sigil-src = {
      url = "github:sigil-tech/sigil";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, sigil-src }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};

    # Build sigild + sigilctl from local source (x86_64)
    sigild = pkgs.buildGoModule {
      pname = "sigild";
      version = "0.1.0-dev";
      src = sigil-src;
      subPackages = [ "cmd/sigild" "cmd/sigilctl" ];
      vendorHash = "sha256-sTX4XPcenyJWKwujIQsBHv6fstG49fNXDxqIe9BZkQY=";
      doCheck = false;  # tests run in CI; Nix sandbox causes false failures
    };

    # Build sigild + sigilctl for aarch64-linux (Apple Silicon VMs)
    aarch64Pkgs = nixpkgs.legacyPackages.aarch64-linux;
    sigild-aarch64 = aarch64Pkgs.buildGoModule {
      pname = "sigild";
      version = "0.1.0-dev";
      src = sigil-src;
      subPackages = [ "cmd/sigild" "cmd/sigilctl" ];
      vendorHash = "sha256-sTX4XPcenyJWKwujIQsBHv6fstG49fNXDxqIe9BZkQY=";
      doCheck = false;
    };

    # Build Sigil Shell frontend (Preact + TypeScript + Vite)
    sigil-shell-frontend = pkgs.buildNpmPackage {
      pname = "sigil-shell-frontend";
      version = "0.1.0";
      src = ./shell;
      npmDepsHash = "sha256-ZEchHoCVuN9gRGEELC+eYvbOq8wNaQ3KLyQKNo3iw5Y=";
      buildPhase = ''
        npm run build
      '';
      installPhase = ''
        cp -r dist $out
      '';
    };

    # Build Sigil Shell (Tauri 2.x desktop app)
    sigil-shell = pkgs.rustPlatform.buildRustPackage {
      pname = "sigil-shell";
      version = "0.1.0";
      src = ./shell/src-tauri;
      cargoLock.lockFile = ./shell/src-tauri/Cargo.lock;

      nativeBuildInputs = with pkgs; [
        pkg-config
        wrapGAppsHook
      ];

      buildInputs = with pkgs; [
        gtk3
        webkitgtk_4_1
        libsoup_3
        openssl
        glib
        glib-networking
        cairo
        pango
        gdk-pixbuf
        atk
        librsvg
      ];

      # Tauri 2.x embeds frontendDist ("../dist") at compile time.
      # Place the pre-built frontend where the relative path resolves.
      preBuild = ''
        mkdir -p ../dist
        cp -r ${sigil-shell-frontend}/* ../dist/
      '';

      meta = with pkgs.lib; {
        description = "Sigil Shell — unified developer environment";
        license = licenses.mit;
        platforms = [ "x86_64-linux" ];
      };
    };

    # Shared module list — the core Sigil OS stack (full desktop)
    coreModules = [
      ./modules/sigil-base.nix
      ./modules/sigil-tools.nix
      ./modules/sigil-hyprland.nix
      ./modules/sigild.nix
      ./modules/sigil-shell.nix
      ./modules/sigil-inference.nix
      # Plymouth splash — enabled per-config via services.sigil-plymouth.enable.
      # Intentionally absent from sigil-vm so VM boots show console output.
      ./modules/sigil-plymouth.nix
      # Dev workstation tools — enabled per-config via sigil.dev.enable.
      ./modules/sigil-dev.nix
    ];

    # Launcher modules — headless VM for Apple Virtualization Framework
    launcherModules = [
      ./modules/sigil-base.nix
      ./modules/sigil-tools.nix
      ./modules/sigild.nix
      ./modules/sigil-inference.nix
      ./hardware/apple-vf.nix
    ];

    # Launcher modules — headless VM for Hyper-V (Windows)
    launcherWindowsModules = [
      ./modules/sigil-base.nix
      ./modules/sigil-tools.nix
      ./modules/sigild.nix
      ./modules/sigil-inference.nix
      ./hardware/hyper-v.nix
    ];
  in {
    # Helper for launcher apps to build a custom NixOS VM with tool overrides.
    #
    # Usage:
    #   sigil-os.lib.mkLauncherVM {
    #     system = "aarch64-linux";
    #     tools  = { editor = "neovim"; containerEngine = "none"; };
    #   }
    #
    # The `tools` attrset maps directly to `sigil.tools.*` options and is
    # merged on top of the defaults defined in sigil-tools.nix.
    lib.mkLauncherVM = { system, platform ? "apple-vf", tools ? {} }:
      let
        localPkgs = nixpkgs.legacyPackages.${system};
        localSigild = localPkgs.buildGoModule {
          pname = "sigild";
          version = "0.1.0-dev";
          src = sigil-src;
          subPackages = [ "cmd/sigild" "cmd/sigilctl" ];
          vendorHash = "sha256-sTX4XPcenyJWKwujIQsBHv6fstG49fNXDxqIe9BZkQY=";
          doCheck = false;
        };
        # Pick the right hardware stub based on platform.
        # apple-vf: Apple Virtualization.framework (macOS, both Intel and Apple Silicon)
        # hyper-v: Microsoft Hyper-V (Windows)
        hardwareModule = {
          "apple-vf" = ./hardware/apple-vf.nix;
          "hyper-v"  = ./hardware/hyper-v.nix;
        }.${platform};
        baseModules = [
          ./modules/sigil-base.nix
          ./modules/sigil-tools.nix
          ./modules/sigild.nix
          ./modules/sigil-inference.nix
          hardwareModule
        ];
      in nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { sigild = localSigild; };
        modules = baseModules ++ [
          {
            sigil.users.enable = false;

            # Apply caller-supplied tool overrides on top of module defaults.
            sigil.tools = { enable = true; } // tools;

            services.sigild = {
              enable = true;
              logLevel = "debug";
              watchDirs  = [ "/workspace" ];
              repoDirs   = [ "/workspace" ];
              dbPath     = "/sigil-profile/data.db";
              network = {
                enable = true;
                bind   = "0.0.0.0";
                port   = 7773;
              };
            };

            services.sigil-inference.enable = true;
          }
        ];
      };

    packages.${system} = {
      inherit sigild sigil-shell;
      default = sigild;
      launcher-windows-toplevel = self.nixosConfigurations.sigil-launcher-windows.config.system.build.toplevel;
      # Full bootable disk image for the Windows (Hyper-V) launcher.
      # GPT + EFI partition + ext4 root with GRUB installed.
      launcher-windows-disk = import ./pkgs/make-disk-image.nix {
        pkgs = pkgs;
        lib = nixpkgs.lib;
        nixosConfig = self.nixosConfigurations.sigil-launcher-windows;
        platform = "hyper-v";
      };
      # x86_64-linux launcher VM artifacts for Intel Macs
      launcher-kernel = self.nixosConfigurations.sigil-launcher-x86.config.boot.kernelPackages.kernel;
      launcher-initrd = self.nixosConfigurations.sigil-launcher-x86.config.system.build.initialRamdisk;
      launcher-toplevel = self.nixosConfigurations.sigil-launcher-x86.config.system.build.toplevel;
      launcher-disk = import ./pkgs/make-disk-image.nix {
        pkgs = pkgs;
        lib = nixpkgs.lib;
        nixosConfig = self.nixosConfigurations.sigil-launcher-x86;
        platform = "apple-vf";
      };
    };

    # x86_64-linux launcher — for Intel Macs using Virtualization.framework
    nixosConfigurations.sigil-launcher-x86 = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      specialArgs = { sigild = sigild; };
      modules = launcherModules ++ [
        {
          sigil.users.enable = false;

          services.sigild = {
            enable = true;
            logLevel = "debug";
            watchDirs  = [ "/workspace" ];
            repoDirs   = [ "/workspace" ];
            dbPath     = "/sigil-profile/data.db";
            network = {
              enable = true;
              bind   = "0.0.0.0";
              port   = 7773;
            };
          };

          services.sigil-inference.enable = true;
        }
      ];
    };

    # aarch64-linux packages — launcher VM artifacts
    packages.aarch64-linux = {
      sigild = sigild-aarch64;
      launcher-kernel = self.nixosConfigurations.sigil-launcher.config.boot.kernelPackages.kernel;
      launcher-initrd = self.nixosConfigurations.sigil-launcher.config.system.build.initialRamdisk;
      launcher-toplevel = self.nixosConfigurations.sigil-launcher.config.system.build.toplevel;
      # Full bootable disk image for the macOS (Apple VF) launcher.
      # Bare ext4 image + kernel + initrd for VZLinuxBootLoader direct boot.
      launcher-disk = import ./pkgs/make-disk-image.nix {
        pkgs = aarch64Pkgs;
        lib = nixpkgs.lib;
        nixosConfig = self.nixosConfigurations.sigil-launcher;
        platform = "apple-vf";
      };
    };


    # Installed NixOS on 2017 MacBook Pro
    nixosConfigurations.sigil = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild sigil-shell; };
      modules = coreModules ++ [
        ./hardware/mbp-2017.nix
        ./services.nix
      ];
    };

    # Live ISO — boots directly into Sigil OS from USB
    nixosConfigurations.sigil-iso = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild sigil-shell; };
      modules = [
        "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
        "${nixpkgs}/nixos/modules/installer/cd-dvd/channel.nix"
      ] ++ coreModules ++ [
        ./iso.nix
      ];
    };

    # VM for fast local testing — no GPU, no WiFi, SSH enabled
    nixosConfigurations.sigil-vm = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild sigil-shell; };
      modules = [
        "${nixpkgs}/nixos/modules/virtualisation/qemu-vm.nix"
        ./modules/sigil-base.nix
        ./modules/sigil-tools.nix
        ./modules/sigild.nix
        ./modules/sigil-shell.nix
        ./modules/sigil-inference.nix
        ./hardware/vm.nix
        {
          # Enable sigild in the VM
          services.sigild = {
            enable = true;
            logLevel = "debug";
            watchDirs = [ "~/workspace" ];
            repoDirs = [ "~/workspace" ];
          };

          services.sigil-shell.enable = true;

          # Auto-create workspace
          system.activationScripts.workspace = ''
            for u in /home/*; do
              user=$(basename "$u")
              mkdir -p "$u/workspace"
              chown "$user:users" "$u/workspace"
            done
          '';
        }
      ];
    };

    # Launcher VM image for macOS — headless aarch64-linux NixOS guest
    # Runs in Apple Virtualization Framework via the native Swift launcher app.
    nixosConfigurations.sigil-launcher = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";
      specialArgs = { sigild = sigild-aarch64; };
      modules = launcherModules ++ [
        {
          # Disable default nick/engineer users — apple-vf.nix defines the sigil user
          sigil.users.enable = false;

          services.sigild = {
            enable = true;
            logLevel = "debug";
            watchDirs = [ "/workspace" ];
            repoDirs = [ "/workspace" ];
            dbPath = "/sigil-profile/data.db";
            network = {
              enable = true;
              bind = "0.0.0.0";
              port = 7773;
            };
          };

          services.sigil-inference.enable = true;
        }
      ];
    };

    # Launcher VM image for Windows — headless x86_64-linux NixOS guest
    # Runs in Hyper-V via the native C# / WinUI 3 launcher app.
    nixosConfigurations.sigil-launcher-windows = nixpkgs.lib.nixosSystem {
      inherit system; # x86_64-linux
      specialArgs = { inherit sigild; };
      modules = launcherWindowsModules ++ [
        {
          sigil.users.enable = false;

          services.sigild = {
            enable = true;
            logLevel = "debug";
            watchDirs = [ "/workspace" ];
            repoDirs = [ "/workspace" ];
            dbPath = "/sigil-profile/data.db";
            network = {
              enable = true;
              bind = "0.0.0.0";
              port = 7773;
            };
          };

          services.sigil-inference.enable = true;
        }
      ];
    };
  };
}
