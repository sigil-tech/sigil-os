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
      inherit sigild;
      default = sigild;
    };

    # Installed NixOS on 2017 MacBook Pro
    nixosConfigurations.sigil = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild; };
      modules = coreModules ++ [
        ./hardware/mbp-2017.nix
        ./services.nix
      ];
    };

    # Live ISO — boots directly into Sigil OS from USB
    nixosConfigurations.sigil-iso = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild; };
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
      specialArgs = { inherit sigild; };
      modules = [
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
            watchDirs = [ "/home/engineer/workspace" ];
            repoDirs = [ "/home/engineer/workspace" ];
          };

          # Auto-create workspace
          system.activationScripts.workspace = ''
            mkdir -p /home/engineer/workspace
            chown engineer:users /home/engineer/workspace
          '';
        }
      ];
    };
  };
}
