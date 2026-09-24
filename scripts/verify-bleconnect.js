async page => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:8080/?mode=bleconnect");
  await page.waitForLoadState("domcontentloaded");

  const desktop = await page.evaluate(() => {
    const root = document.querySelector("[data-ble-connect-tutorial]");
    const text = document.body.textContent || "";
    return {
      root: !!root,
      title: document.title,
      direct: text.includes("直接连接") && text.includes("连接魔方"),
      troubleshooting: text.includes("连接失败") && text.includes("设备占用"),
      macFallback: text.includes("MAC") && text.includes("兜底") && text.includes("不是连接前的必填项"),
      privacy: text.includes("匿名标识") && text.includes("不保证显示真实 MAC"),
      compatibility: text.includes("Chrome / Edge") && text.includes("Safari") && text.includes("Firefox"),
      returnLinks: document.querySelectorAll('[data-ble-connect-return][href="?mode=blecross"]').length,
      startLink: !!document.querySelector('[data-ble-connect-start][href="?mode=blecross"]'),
    };
  });

  if (
    !desktop.root ||
    !desktop.direct ||
    !desktop.troubleshooting ||
    !desktop.macFallback ||
    !desktop.privacy ||
    !desktop.compatibility ||
    desktop.returnLinks < 2 ||
    !desktop.startLink
  ) {
    throw new Error(`蓝牙连接教程内容或导航异常: ${JSON.stringify(desktop)}`);
  }

  await page.setViewportSize({ width: 360, height: 740 });
  await page.reload();
  const mobile = await page.evaluate(() => {
    const root = document.querySelector("[data-ble-connect-tutorial]");
    const compatibility = document.querySelector("[data-ble-compatibility]");
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      rootOverflow: root ? root.scrollWidth > root.clientWidth + 1 : true,
      compatibilityOverflow: compatibility
        ? compatibility.scrollWidth > compatibility.clientWidth + 1
        : true,
    };
  });
  if (mobile.documentOverflow || mobile.rootOverflow || mobile.compatibilityOverflow) {
    throw new Error(`蓝牙教程移动端横向溢出: ${JSON.stringify(mobile)}`);
  }

  await page.goto("http://127.0.0.1:8080/?mode=blecross");
  await page.waitForFunction(() => window.__bleCross);
  const helpLink = await page.evaluate(async () => {
    const vm = window.__bleCross;
    vm.helpDialog = true;
    await vm.$nextTick();
    const link = document.querySelector('[data-ble-connect-help-link][href="?mode=bleconnect"]');
    return link ? (link.textContent || "").trim() : "";
  });
  if (helpLink !== "蓝牙连接教程") {
    throw new Error(`使用说明缺少蓝牙教程入口: ${JSON.stringify(helpLink)}`);
  }

  console.log("BLE 蓝牙连接教程验证通过");
}
