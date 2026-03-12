SHELL := bash
NIX := nix --extra-experimental-features 'nix-command flakes'

.PHONY: check eval build-system build-iso build-vm run-vm deploy help

WIN_ISO_PATH := /mnt/c/Users/nick/Downloads/sigil-os.iso
VM_DISK := /tmp/sigil-vm.qcow2
VM_MEMORY := 4096
VM_CPUS := 2

# SSH target for the installed MBP (set via env or override)
MBP_HOST ?= engineer@sigil.local

# ─── Fast feedback (seconds) ───────────────────────────────────────

check: ## Evaluate flake + run nix flake check (~5s)
	$(NIX) flake check

eval: ## Evaluate all configs without building (~3s, catches Nix errors)
	@echo "==> Evaluating sigil (installed)..."
	$(NIX) eval .#nixosConfigurations.sigil.config.system.build.toplevel --no-build 2>&1 | tail -1
	@echo "==> Evaluating sigil-iso..."
	$(NIX) eval .#nixosConfigurations.sigil-iso.config.system.build.isoImage --no-build 2>&1 | tail -1
	@echo "==> Evaluating sigil-vm..."
	$(NIX) eval .#nixosConfigurations.sigil-vm.config.system.build.toplevel --no-build 2>&1 | tail -1
	@echo "All configs evaluate cleanly."

# ─── Build targets (minutes) ──────────────────────────────────────

build-system: ## Build system closure (no ISO image, much faster)
	$(NIX) build .#nixosConfigurations.sigil-iso.config.system.build.toplevel
	@echo "System closure built at ./result"

build-iso: ## Build full ISO and copy to Windows Downloads
	$(NIX) build .#nixosConfigurations.sigil-iso.config.system.build.isoImage
	chmod u+w "$(WIN_ISO_PATH)" 2>/dev/null || true
	cp result/iso/*.iso "$(WIN_ISO_PATH)"
	@echo "ISO copied to C:\\Users\\nick\\Downloads\\sigil-os.iso"

# ─── VM testing ───────────────────────────────────────────────────

build-vm: ## Build VM system closure
	$(NIX) build .#nixosConfigurations.sigil-vm.config.system.build.toplevel
	@echo "VM system built at ./result"

run-vm: build-vm ## Build and boot VM in QEMU (no GPU, SSH on localhost:2222)
	@if [ ! -f "$(VM_DISK)" ]; then \
		echo "==> Creating VM disk..."; \
		qemu-img create -f qcow2 "$(VM_DISK)" 20G; \
	fi
	@echo "==> Booting Sigil OS VM (SSH: ssh -p 2222 engineer@localhost)"
	qemu-system-x86_64 \
		-m $(VM_MEMORY) \
		-smp $(VM_CPUS) \
		-enable-kvm \
		-drive file=$(VM_DISK),format=qcow2,if=virtio \
		-kernel ./result/kernel \
		-initrd ./result/initrd \
		-append "init=$(shell readlink -f ./result/init) root=/dev/vda1 console=ttyS0" \
		-net nic,model=virtio \
		-net user,hostfwd=tcp::2222-:22 \
		-nographic

# ─── Remote deploy to installed MBP ──────────────────────────────

deploy: ## Deploy to installed MBP over SSH (nixos-rebuild switch)
	@echo "==> Deploying to $(MBP_HOST)..."
	nixos-rebuild switch \
		--flake .#sigil \
		--target-host $(MBP_HOST) \
		--use-remote-sudo
	@echo "Deploy complete."

deploy-test: ## Deploy to MBP without switching (test only, rollback on reboot)
	@echo "==> Test-deploying to $(MBP_HOST)..."
	nixos-rebuild test \
		--flake .#sigil \
		--target-host $(MBP_HOST) \
		--use-remote-sudo
	@echo "Test deploy active (reverts on reboot)."

# ─── Help ─────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
