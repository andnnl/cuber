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
const webpack = fs.readFileSync("webpack.config.js", "utf8");
const wasmSolver = fs.readFileSync("src/wasm/WasmSolver.ts", "utf8");
const solverWorkerClient = fs.readFileSync("src/wasm/SolverWorkerClient.ts", "utf8");
const bleTrainer = fs.readFileSync("src/vue/BleCrossTrainer/index.ts", "utf8");

assert.ok(fs.existsSync("public/cube_cross_worker.js"));
for (const asset of ["cube_cross_analysis_worker.js", "multi-view-grip.mjs", "joint_table.bin", "cube_cross_solve_bg.wasm"]) {
  assert.ok(fs.existsSync(`public/${asset}`), `缺少分析资源: ${asset}`);
  assert.match(webpack, new RegExp(asset.replaceAll(".", "\\.")), `构建未复制分析资源: ${asset}`);
  assert.match(buildScript, /cp -r dist\/\* "\$ASSETS\/"/, "APK 必须同步全部生产资源");
}
assert.match(webpack, /from: "public\/multi-view-grip\.mjs", to: "multi-view-grip\.js"/, "模块使用兼容 WebView 的 .js MIME 后缀");
assert.match(fs.readFileSync("public/cube_cross_analysis_worker.js", "utf8"), /from '\.\/multi-view-grip\.js'/);
const solverWorker = fs.readFileSync("public/cube_cross_worker.js", "utf8");

assert.match(main, /index\.html\?mode=blecross/);
assert.match(main, /setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
assert.match(main, /BuildConfig\.DEBUG\s*\|\|\s*cm\.messageLevel\(\)\s*==\s*ConsoleMessage\.MessageLevel\.WARNING/);
assert.match(main, /ConsoleMessage\.MessageLevel\.ERROR/);
assert.match(webpack, /cube_cross_worker\.js/);
for (const operation of ["init", "loadTable", "generateTable", "solveMulti", "solveXCross", "getTableStats"]) {
  assert.match(solverWorker, new RegExp(`case ["']${operation}["']`));
}
assert.match(wasmSolver, /SolverWorkerClient/);
assert.match(wasmSolver, /client\?\.terminate\(\)/);
assert.match(solverWorkerClient, /catch \(error\) \{[\s\S]*this\.pending\.delete\(id\)/);
assert.match(bleTrainer, /requestAnimationFrame\(this\.loopFrame\)/);
assert.match(bleTrainer, /cancelAnimationFrame\(this\.animationFrameId\)/);
assert.match(gradle, /versionCode\s*=\s*8/);
assert.match(gradle, /versionName\s*=\s*"1\.0\.7"/);
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
