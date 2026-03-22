{
  description = "Sigil OS — AI-native operating system for software engineers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    sigil-src = {
      url = "git+file:///home/nick/workspace/sigil";
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
      vendorHash = null;
    };

    # Build sigild + sigilctl for aarch64-linux (Apple Silicon VMs)
    aarch64Pkgs = nixpkgs.legacyPackages.aarch64-linux;
    sigild-aarch64 = aarch64Pkgs.buildGoModule {
      pname = "sigild";
      version = "0.1.0-dev";
      src = sigil-src;
      subPackages = [ "cmd/sigild" "cmd/sigilctl" ];
      vendorHash = null;
    };

    # Build Sigil Shell frontend (Preact + TypeScript + Vite)
    sigil-shell-frontend = pkgs.buildNpmPackage {
      pname = "sigil-shell-frontend";
      version = "0.1.0";
      src = ./shell;
      npmDepsHash = "sha256-htKRePY1DtwC8XUdH8hrNDgrSL4iHysCsW6ww/oiaMw=";
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
      ./modules/sigil-hyprland.nix
      ./modules/sigild.nix
      ./modules/sigil-shell.nix
      ./modules/sigil-inference.nix
      # Plymouth splash — enabled per-config via services.sigil-plymouth.enable.
      # Intentionally absent from sigil-vm so VM boots show console output.
      ./modules/sigil-plymouth.nix
    ];

    # Launcher modules — headless VM for Apple Virtualization Framework
    launcherModules = [
      ./modules/sigil-base.nix
      ./modules/sigild.nix
      ./modules/sigil-inference.nix
      ./hardware/apple-vf.nix
    ];

    # Launcher modules — headless VM for Hyper-V (Windows)
    launcherWindowsModules = [
      ./modules/sigil-base.nix
      ./modules/sigild.nix
      ./modules/sigil-inference.nix
      ./hardware/hyper-v.nix
    ];
  in {
    packages.${system} = {
      inherit sigild sigil-shell;
      default = sigild;
      launcher-windows-toplevel = self.nixosConfigurations.sigil-launcher-windows.config.system.build.toplevel;
    };

    # aarch64-linux packages — launcher VM artifacts
    packages.aarch64-linux = {
      sigild = sigild-aarch64;
      launcher-kernel = self.nixosConfigurations.sigil-launcher.config.boot.kernelPackages.kernel;
      launcher-initrd = self.nixosConfigurations.sigil-launcher.config.system.build.initialRamdisk;
      launcher-toplevel = self.nixosConfigurations.sigil-launcher.config.system.build.toplevel;
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
