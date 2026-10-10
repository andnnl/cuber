const assert = require("assert");
const fs = require("fs");

const main = fs.readFileSync(
  "android/app/src/main/java/com/cuber/trainer/MainActivity.java",
  "utf8"
);
const gradle = fs.readFileSync("android/app/build.gradle.kts", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const buildScript = fs.readFileSync("android/build-apk.sh", "utf8");
const bleTemplate = fs.readFileSync("src/vue/BleCrossTrainer/index.html", "utf8");
const bleBridge = fs.readFileSync(
  "android/app/src/main/java/com/cuber/trainer/BleBridge.java",
  "utf8"
);

assert.match(main, /index\.html\?mode=blecross/);
assert.match(main, /setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
assert.match(gradle, /versionCode\s*=\s*6/);
assert.match(gradle, /versionName\s*=\s*"1\.0\.5"/);
assert.match(gradle, /buildFeatures\s*\{[\s\S]*buildConfig\s*=\s*true[\s\S]*\}/);

for (const permission of ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION"]) {
  assert.match(manifest, new RegExp(`android\\.permission\\.${permission}`));
}

assert.match(buildScript, /java-21-openjdk-amd64/);
assert.match(buildScript, /JAVA_HOME/);
assert.match(bleTemplate, /v-model="scanDialog"/);
assert.match(bleTemplate, /v-for="device in scanDevices"/);
assert.match(bleTemplate, /pickDevice\(device\.address\)/);
assert.match(bleTemplate, /restartScan/);
assert.match(bleTemplate, /closeScanDialog/);
assert.match(bleBridge, /Log\.i\(TAG, "scan requested"\)/);
assert.match(bleBridge, /Log\.i\(TAG, "scan started"\)/);
assert.match(bleBridge, /Log\.i\(TAG, "connect requested:/);

console.log("Android app configuration tests passed");
