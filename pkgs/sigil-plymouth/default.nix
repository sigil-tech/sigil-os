{ stdenvNoCC, lib }:

stdenvNoCC.mkDerivation {
  pname = "sigil-plymouth";
  version = "1.0.0";

  src = ./theme;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/plymouth/themes/sigil
    cp -r * $out/share/plymouth/themes/sigil/
    # Patch hardcoded /usr/ paths to the Nix store location so Plymouth
    # resolves ImageDir and ScriptFile correctly inside the initrd.
    substituteInPlace $out/share/plymouth/themes/sigil/sigil.plymouth \
      --replace-fail "/usr/" "$out/"
    runHook postInstall
  '';

  meta = {
    description = "Sigil OS Plymouth boot splash theme";
    platforms = lib.platforms.linux;
  };
}
