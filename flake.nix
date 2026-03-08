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
  in {
    packages.${system} = {
      inherit sigild;
      default = sigild;
    };

    # Full NixOS system configuration (for installed systems)
    nixosConfigurations.sigil = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild; };
      modules = [
        ./modules/sigil-base.nix
        ./modules/sigil-hyprland.nix
        ./modules/sigild.nix
        ./modules/sigil-shell.nix
        ./modules/sigil-inference.nix
      ];
    };

    # Live ISO — boots directly into Sigil OS from USB
    nixosConfigurations.sigil-iso = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = { inherit sigild; };
      modules = [
        "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
        "${nixpkgs}/nixos/modules/installer/cd-dvd/channel.nix"
        ./modules/sigil-base.nix
        ./modules/sigil-hyprland.nix
        ./modules/sigild.nix
        ./modules/sigil-shell.nix
        ./modules/sigil-inference.nix
        ./iso.nix
      ];
    };
  };
}
