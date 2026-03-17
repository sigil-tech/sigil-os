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

    # Build sigild + sigilctl from local source
    sigild = pkgs.buildGoModule {
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
      npmDepsHash = "sha256-85F5caMK2eGTnQty7wf+L0sy8tAJ4Ol0Kbvyka4mFhA=";
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

    # Shared module list — the core Sigil OS stack
    coreModules = [
      ./modules/sigil-base.nix
      ./modules/sigil-hyprland.nix
      ./modules/sigild.nix
      ./modules/sigil-shell.nix
      ./modules/sigil-inference.nix
    ];
  in {
    packages.${system} = {
      inherit sigild sigil-shell;
      default = sigild;
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
  };
}
