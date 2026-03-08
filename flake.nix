{
  description = "Sigil OS — AI-native operating system for software engineers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
  in {
    # Full NixOS system configuration
    nixosConfigurations.sigil = nixpkgs.lib.nixosSystem {
      inherit system;
      modules = [
        ./modules/sigil-base.nix
        ./modules/sigil-hyprland.nix
        ./modules/sigild.nix
        ./modules/sigil-shell.nix
        ./modules/sigil-inference.nix
      ];
    };

    # Installer ISO
    nixosConfigurations.sigil-iso = nixpkgs.lib.nixosSystem {
      inherit system;
      modules = [
        "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
        "${nixpkgs}/nixos/modules/installer/cd-dvd/channel.nix"
        ./iso.nix
      ];
    };

    # Individual packages
    packages.${system} = {
      sigild = pkgs.buildGoModule {
        pname = "sigild";
        version = "0.1.0-dev";
        src = builtins.fetchGit {
          url = "https://github.com/wambozi/sigil";
          ref = "main";
        };
        subPackages = [ "cmd/sigild" "cmd/sigilctl" ];
        vendorHash = null; # set after first build
      };
    };
  };
}
