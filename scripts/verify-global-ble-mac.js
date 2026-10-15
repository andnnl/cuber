async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__appShell);
  await page.locator('[data-global-connect]').click();
  const dialog = page.getByRole('dialog', { name: '蓝牙魔方连接' });
  const mac = dialog.getByRole('textbox', { name: 'MAC 地址' });
  if (!await mac.isVisible()) throw new Error('浏览器连接弹窗未显示 MAC 输入框');
  if (!await dialog.getByRole('button', { name: '用 MAC 连接' }).count()) throw new Error('缺少独立的 MAC 连接按钮');
  if (!await page.evaluate(() => !!navigator.bluetooth)) {
    if (!await dialog.getByText(/不支持 Web Bluetooth/).count()) throw new Error('不支持的浏览器未给出提示');
    if (await dialog.getByRole('button', { name: '用 MAC 连接' }).isEnabled()) throw new Error('不支持的浏览器不应允许连接');
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: () => Promise.reject(new Error('测试无需真机')) } });
  });
  await page.reload();
  await page.waitForFunction(() => window.__appShell);
  await page.locator('[data-global-connect]').click();
  await page.evaluate(() => {
    const shell = window.__appShell;
    shell.session.connect = async (kind, opts) => { window.__macConnectCall = { kind, opts }; };
  });
  await mac.fill('invalid');
  await dialog.getByRole('button', { name: '用 MAC 连接' }).click();
  if (!await dialog.getByText(/请输入有效/).count() || await page.evaluate(() => !!window.__macConnectCall)) {
    throw new Error('无效 MAC 不应进入连接层');
  }
  await mac.fill('aa-bb-cc-dd-ee-ff');
  await dialog.getByRole('button', { name: '用 MAC 连接' }).click();
  const withMac = await page.evaluate(() => window.__macConnectCall);
  if (withMac?.kind !== 'web' || withMac.opts?.mac !== 'AA:BB:CC:DD:EE:FF') {
    throw new Error(`MAC 未传到连接层: ${JSON.stringify(withMac)}`);
  }
  await page.locator('[data-global-connect]').click();
  await dialog.getByRole('button', { name: '选择魔方连接' }).click();
  const withoutMac = await page.evaluate(() => window.__macConnectCall);
  if (withoutMac?.kind !== 'web' || withoutMac.opts) {
    throw new Error(`普通选择不应偷偷使用 MAC: ${JSON.stringify(withoutMac)}`);
  }
  return 'MAC 输入与浏览器支持提示正常';
}
