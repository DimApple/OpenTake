#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

: "${OPENTAKE_APK_KEYSTORE:?Set this to the absolute path of the signing keystore}"
: "${OPENTAKE_APK_PASSWORD:?Set the signing password}"
: "${1:?Pass the output APK path}"
output=$(realpath -m "$1")
tool_dir=${OPENTAKE_ANDROID_TOOLS:-"$PWD/.android-tools"}
mkdir -p "$tool_dir"

fetch_tool() {
  local name=$1 path=$2 base=${3:-https://repo.maven.apache.org/maven2}
  if [[ ! -s "$tool_dir/$name.jar" ]]; then
    curl -fsSL "$base/$path" -o "$tool_dir/$name.jar.part"
    mv "$tool_dir/$name.jar.part" "$tool_dir/$name.jar"
  fi
}
fetch_tool apktool org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar
fetch_tool r8 net/mbonnin/r8/r8/8.3.8/r8-8.3.8.jar
fetch_tool apksig-8.7.3 com/android/tools/build/apksig/8.7.3/apksig-8.7.3.jar https://dl.google.com/dl/android/maven2
fetch_tool ecj org/eclipse/jdt/ecj/3.46.100/ecj-3.46.100.jar
fetch_tool android org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/assets/web" "$work/res/drawable" "$work/classes" "$work/dex" "$work/sign"
npm run build
cp -R dist/. "$work/assets/web/"
cp public/icon-192.png "$work/res/drawable/opentake_icon.png"
unzip -p "$tool_dir/apktool.jar" prebuilt/linux/aapt2 > "$work/aapt2"
chmod +x "$work/aapt2"
"$work/aapt2" compile --dir "$work/res" -o "$work/res.zip"
"$work/aapt2" link -I "$tool_dir/android.jar" --manifest android/AndroidManifest.xml \
  -A "$work/assets" -o "$work/unsigned.apk" "$work/res.zip"
java -jar "$tool_dir/ecj.jar" -8 -proc:none -classpath "$tool_dir/android.jar" -d "$work/classes" android/MainActivity.java
(cd "$work/classes" && zip -qr "$work/classes.jar" .)
java -cp "$tool_dir/r8.jar" com.android.tools.r8.D8 --min-api 26 --lib "$tool_dir/android.jar" \
  --output "$work/dex" "$work/classes.jar"
(cd "$work/dex" && zip -q "$work/unsigned.apk" classes.dex)
java -jar "$tool_dir/ecj.jar" -8 -proc:none -classpath "$tool_dir/apksig-8.7.3.jar" -d "$work/sign" android/SignApk.java
java -cp "$work/sign:$tool_dir/apksig-8.7.3.jar" SignApk "$OPENTAKE_APK_KEYSTORE" "$work/unsigned.apk" "$output"
"$work/aapt2" dump badging "$output"
unzip -tq "$output"
