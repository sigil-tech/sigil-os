SHELL := bash

.PHONY: build-iso

build-iso:
	nix --extra-experimental-features 'nix-command flakes' build .#nixosConfigurations.sigil-iso.config.system.build.isoImage
