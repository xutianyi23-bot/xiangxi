#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' macos/Info.plist)
mkdir -p "build/$version" build/swift-cache
stage=$(mktemp -d "build/$version/.package.XXXXXX")
trap 'rm -rf "$stage"' EXIT
out="$stage/相析.app"
archive="相析-$version-内测版-macOS.zip"
mkdir -p "$out/Contents/MacOS" "$out/Contents/Resources/web"
for arch in arm64 x86_64; do
  target="$arch-apple-macos13.0"
  clang -fobjc-arc -target "$target" -fmodules -fmodules-cache-path=build/swift-cache -c macos/PaperProxy.m -o "$stage/PaperProxy-$arch.o"
  swiftc -import-objc-header macos/PaperProxy.h "$stage/PaperProxy-$arch.o" -larchive -framework Network -O -module-cache-path build/swift-cache -target "$target" macos/*.swift -o "$stage/ChemistWorkspace-$arch"
done
lipo -create "$stage/ChemistWorkspace-arm64" "$stage/ChemistWorkspace-x86_64" -output "$out/Contents/MacOS/ChemistWorkspace"
cp macos/Info.plist "$out/Contents/"
cp web/index.html web/*.js web/style.css web/xiangxi.svg "$out/Contents/Resources/web/"
cp LICENSE.md macos/mail_reader.py macos/reagent_heic.py macos/template_deck.py macos/ReportBase.pptx macos/Workspace.icns "$out/Contents/Resources/"
codesign --force --sign - "$out"
codesign --verify --strict "$out"
ditto -c -k --norsrc --noextattr --keepParent "$out" "$stage/$archive"
unzip -tq "$stage/$archive"
if [ -d "build/$version/相析.app" ]; then mv "build/$version/相析.app" "$stage/previous.app"; fi
mv "$out" "build/$version/相析.app"
mv "$stage/$archive" "build/$archive"
