async page => {
  const base = 'http://127.0.0.1:18083/';
  await page.goto(base);
  await page.locator('button').filter({ hasText: 'menu' }).first().click();
  await page.getByRole('button', { name: '公式计时' }).click();
  await page.waitForURL('**/?mode=formulatimer', { timeout: 4000 });
  await page.getByRole('heading', { name: '公式集训练计时' }).waitFor();
  const z2 = page.getByRole('checkbox', { name: '出题前 z2' });
  await z2.waitFor();
  await z2.check();
  if (!/^打乱：z2(?:\s|$)/.test(await page.locator('.formula-timer-scramble').innerText()))
    throw Error('开启复选框后，题面缺少前置 z2');
  await page.reload();
  if (!await z2.isChecked()) throw Error('刷新后 z2 复选框状态丢失');
  await z2.uncheck();
  if (/^打乱：z2(?:\s|$)/.test(await page.locator('.formula-timer-scramble').innerText()))
    throw Error('关闭复选框后依然前置 z2');
  return { route: page.url(), checkbox: await z2.isChecked() };
}
