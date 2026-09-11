// 蓝牙魔方模块单测 (Node 运行, 依赖先由 tsc 编译到 .tmp/ble):
//   npm run test:ble
// 覆盖: move-diff 置换表 (Kociemba 官方样例) / 十字判定 / GAN Gen2 全链路
// (AES 加解密回路 + 位帧解析 + 事件转换) / 协议注册表

const assert = require("assert");
const path = require("path");

const OUT = path.join(__dirname, "..", ".tmp", "ble");
const req = (m) => require(path.join(OUT, m));

// 事件派发经 async driver (微任务), applyFormula/命令响应后需 flush 再断言
const flush = () => new Promise((r) => setTimeout(r, 0));

const moveDiff = req("move-diff.js");
const facelets = req("facelets.js");
const gan = req("protocols/gan.js");
const registry = req("protocols/registry.js");
const { MockGanCubeTransport } = req("mock-transport.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed++;
        console.log(`  ✓ ${name}`);
      },
      (err) => {
        failed++;
        console.error(`  ✗ ${name}`);
        console.error(`    ${err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n    ") : err}`);
      }
    );
}

async function main() {
  console.log("== move-diff ==");

  await test("solved → F R 与 Kociemba 官方样例一致 (vendor utils.ts 注释)", () => {
    const got = moveDiff.applyFormula("F R");
    assert.strictEqual(
      got,
      "UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB",
      `F R 后 facelets 不符: ${got}`
    );
  });

  await test("F R 的 CP/CO/EP/EO 与官方样例一致", () => {
    let st = moveDiff.solvedCubie();
    st = moveDiff.applyCubieMove(st, "F", 1);
    st = moveDiff.applyCubieMove(st, "R", 1);
    assert.deepStrictEqual(st.cp, [0, 5, 2, 1, 7, 4, 6, 3]);
    assert.deepStrictEqual(st.co, [1, 2, 0, 2, 1, 1, 0, 2]);
    assert.deepStrictEqual(st.ep, [1, 9, 2, 3, 11, 8, 6, 7, 4, 5, 10, 0]);
    assert.deepStrictEqual(st.eo, [1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
  });

  await test("全部 6 面三种转法 round-trip 可逆", () => {
    const solved = moveDiff.cubieToFacelets(moveDiff.solvedCubie());
    for (const f of "URFDLB") {
      for (const s of ["", "'", "2"]) {
        const mv = f + s;
        const st = moveDiff.applyFormula(mv);
        const inv = moveDiff.applyFaceletMove(st, moveDiff.invertMove(mv));
        assert.strictEqual(inv, solved, `${mv} 逆后未复原`);
      }
    }
  });

  await test("diffToMoves: 单步", () => {
    const next = moveDiff.applyFaceletMove(facelets.SOLVED_FACELETS, "R'");
    assert.deepStrictEqual(moveDiff.diffToMoves(facelets.SOLVED_FACELETS, next), ["R'"]);
  });

  await test("diffToMoves: 两步 (快速连转兜底)", () => {
    const next = moveDiff.applyFormula("R U");
    const moves = moveDiff.diffToMoves(facelets.SOLVED_FACELETS, next);
    assert.ok(moves !== null && moves.length <= 2, `diffToMoves 失败: ${moves}`);
    const replay = moveDiff.applyFormula(moves.join(" "));
    assert.strictEqual(replay, next);
  });

  await test("diffToMoves: 相同状态返回空数组, 不可解释返回 null", () => {
    assert.deepStrictEqual(moveDiff.diffToMoves("A".repeat(54), "A".repeat(54)).length, 0);
    assert.strictEqual(moveDiff.diffToMoves(facelets.SOLVED_FACELETS, "X".repeat(54)), null);
  });

  await test("simplifyMoves: 相邻同面合并 (D,D→D2), 三次→逆, 反向抵消", () => {
    assert.deepStrictEqual(moveDiff.simplifyMoves(["D", "D"]), ["D2"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["R", "R", "R"]), ["R'"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["R", "R'"]), []);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["D", "D", "D", "D"]), []);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["R", "R", "U", "U"]), ["R2", "U2"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["R", "U", "R'", "U'"]), ["R", "U", "R'", "U'"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["R", "R", "R", "U"]), ["R'", "U"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves(["D2"]), ["D2"]);
    assert.deepStrictEqual(moveDiff.simplifyMoves([]), []);
  });

  console.log("== facelets ==");

  await test("isCrossDone: 复原态为真, 打乱为假, 十字解出为真", () => {
    assert.strictEqual(facelets.isCrossDone(facelets.SOLVED_FACELETS), true);
    assert.strictEqual(facelets.isCrossDone(moveDiff.applyFormula("R U F L2 D'")), false);
    // R 后仅 DR 棱被换出, R' 还原 → 十字恢复
    assert.strictEqual(facelets.isCrossDone(moveDiff.applyFormula("R R'")), true);
    assert.strictEqual(facelets.isCrossDone(moveDiff.applyFormula("D")), false);
    assert.strictEqual(facelets.isCrossDone(""), false);
    assert.strictEqual(facelets.isCrossDone("X".repeat(54)), false);
  });

  await test("brandFaceletsToState: 合法串恒等返回, 中心错位/非法字符返回 null", () => {
    assert.strictEqual(facelets.brandFaceletsToState(facelets.SOLVED_FACELETS), facelets.SOLVED_FACELETS);
    // 交换两个中心 (U 中心换 R 色) → 非法
    const bad = facelets.SOLVED_FACELETS.split("");
    bad[4] = "R";
    assert.strictEqual(facelets.brandFaceletsToState(bad.join("")), null);
    assert.strictEqual(facelets.brandFaceletsToState("short"), null);
  });

  await test("isF2LSlotDone/f2lSlotsDone: 复原态全完成, F/D 转动按槽位判定", () => {
    // 复原态: 4 槽位全完成
    assert.deepStrictEqual(facelets.f2lSlotsDone(facelets.SOLVED_FACELETS), ["FL", "FR", "BL", "BR"]);
    // F 转动: FR/FL 槽位 (角 DFR/DLF + 棱 FR/FL 参与 F 面) 破坏, BL/BR 不动
    const afterF = moveDiff.applyFormula("F");
    assert.deepStrictEqual(facelets.f2lSlotsDone(afterF), ["BL", "BR"]);
    assert.strictEqual(facelets.isF2LSlotDone(afterF, "FR"), false);
    assert.strictEqual(facelets.isF2LSlotDone(afterF, "BR"), true);
    // D 转动: 4 个 D 层角块整体换位 (棱不动), 无一槽位角+棱同时原位
    const afterD = moveDiff.applyFormula("D");
    assert.deepStrictEqual(facelets.f2lSlotsDone(afterD), []);
    // R' 恢复: R 层含 DFR 角与 FR/BR 棱, R R' 后全恢复
    assert.deepStrictEqual(facelets.f2lSlotsDone(moveDiff.applyFormula("R R'")), ["FL", "FR", "BL", "BR"]);
    // 非法槽位/非法串
    assert.strictEqual(facelets.isF2LSlotDone(facelets.SOLVED_FACELETS, "XX"), false);
    assert.strictEqual(facelets.isF2LSlotDone("X".repeat(54), "FR"), false);
  });

  console.log("== protocols ==");

  await test("registry: 按 UUID 查协议, 大小写不敏感", () => {
    const meta = registry.findProtocolByService("6E400001-B5A3-F393-E0A9-E50E24DC4179");
    assert.ok(meta && meta.brand === "GAN Gen2" && meta.supported);
    assert.strictEqual(registry.findProtocolByService("0000-unknown"), null);
  });

  await test("ganGenForService / macToSalt", () => {
    assert.strictEqual(gan.ganGenForService("6e400001-b5a3-f393-e0a9-e50e24dc4179"), 2);
    assert.strictEqual(gan.ganGenForService("8653000a-43e6-47b7-9cb0-5fc21d4ae340"), 3);
    assert.strictEqual(gan.ganGenForService("00000010-0000-fff7-fff6-fff5fff4fff0"), 4);
    assert.deepStrictEqual(Array.from(gan.macToSalt("AA:BB:CC:DD:EE:FF")), [0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa]);
  });

  console.log("== GAN Gen2 全链路 (Mock) ==");

  await test("连接后 REQUEST_FACELETS 返回复原态", async () => {
    const transport = new MockGanCubeTransport();
    const link = new gan.GanCubeLink(transport);
    const events = [];
    link.onEvent((e) => events.push(e));
    const info = await link.connect();
    await flush();
    assert.strictEqual(info.brand, "GAN");
    assert.strictEqual(link.protocolGen, 2);
    const faceletEvents = events.filter((e) => e.type === "facelets");
    assert.strictEqual(faceletEvents.length, 1);
    assert.strictEqual(faceletEvents[0].facelets, facelets.SOLVED_FACELETS);
  });

  await test("转动事件流: MOVE 与 FACELETS 事件与推演状态一致", async () => {
    const transport = new MockGanCubeTransport();
    const link = new gan.GanCubeLink(transport);
    const events = [];
    link.onEvent((e) => events.push(e));
    await link.connect();
    await flush();
    const formula = "R U R' U2 F' L D2 B";
    transport.applyFormula(formula);
    await flush();
    const moves = events.filter((e) => e.type === "move").map((e) => e.move);
    assert.deepStrictEqual(moves, ["R", "U", "R'", "U", "U", "F'", "L", "D", "D", "B"]);
    const lastFacelets = [...events].reverse().find((e) => e.type === "facelets");
    assert.strictEqual(lastFacelets.facelets, moveDiff.applyFormula(formula));
  });

  await test("电量/硬件命令响应", async () => {
    const transport = new MockGanCubeTransport();
    const link = new gan.GanCubeLink(transport);
    const events = [];
    link.onEvent((e) => events.push(e));
    await link.connect();
    await flush();
    await link.requestHardware();
    await flush();
    const hw = events.find((e) => e.type === "hardware");
    assert.ok(hw && hw.name === "GANMOCK1");
    const bat = events.find((e) => e.type === "battery");
    assert.ok(bat && bat.level === 87);
  });

  await test("十字判定: 实体转动解出十字后 isCrossDone 为真", async () => {
    const transport = new MockGanCubeTransport();
    const link = new gan.GanCubeLink(transport);
    let state = "";
    link.onEvent((e) => {
      if (e.type === "facelets") {
        state = e.facelets;
      }
    });
    await link.connect();
    await flush();
    // 打乱: R 使 DR 棱离位 (最小十字破坏场景)
    transport.applyFormula("R");
    await flush();
    assert.strictEqual(facelets.isCrossDone(state), false);
    // 实体还原: R'
    transport.applyFormula("R'");
    await flush();
    assert.strictEqual(facelets.isCrossDone(state), true);
  });

  await test("MAC 缺失时连接报错 (Gen2 解密必需)", async () => {
    const transport = new MockGanCubeTransport();
    transport.connect = async () => ({ name: "GAN", brand: "GAN", serviceUuids: ["6e400001-b5a3-f393-e0a9-e50e24dc4179"] });
    const link = new gan.GanCubeLink(transport);
    await assert.rejects(() => link.connect(), /MAC/);
  });

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
