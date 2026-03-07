{ config, lib, ... }:
with lib;
{
  options.services.aether-shell.keybindings = {
    enable = mkEnableOption "Aether Shell dynamic keybinding profiles";
    profiles = mkOption {
      type = types.attrsOf (types.attrsOf types.str);
      default = {
        terminal = {};
        editor   = {};
        browser  = {};
        git      = {};
      };
      description = "Keybinding profiles per tool. Each value is an attrset of key -> action.";
    };
  };
}
