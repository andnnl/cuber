async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=oll-transfer-${Date.now()}`);
  await page.evaluate(() => {
    localStorage.setItem('cuberCustomOllLibrary', JSON.stringify({ version: 1, items: [
      { id: 'custom-old', name: '旧公式', origin: "F R U R' U' F'" },
    ] }));
    localStorage.removeItem('seamlessOpSettings');
  });
  await page.reload();
  await page.getByRole('button', { name: /选择 OLL/ }).click();
  const dialog = page.getByRole('dialog', { name: '选择 OLL' });
  await dialog.getByRole('button', { name: /自定义分组/ }).click();
  const jsonDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出 JSON' }).click();
  const json = await jsonDownload;
  if (!/\.json$/.test(json.suggestedFilename())) throw Error('JSON 导出扩展名错误');
  const textDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出纯文本' }).click();
  const text = await textDownload;
  if (!/\.txt$/.test(text.suggestedFilename())) throw Error('纯文本导出扩展名错误');
  const file = dialog.locator('input[type=file]');
  await file.setInputFiles('/dd/workspace_trae/cuber/scripts/fixtures/custom-oll-merge.txt');
  await dialog.getByText(/新增 1.*跳过重复 1.*改名 1/).waitFor();
  await dialog.getByText('旧公式 (2)', { exact: true }).waitFor();
  await file.setInputFiles('/dd/workspace_trae/cuber/scripts/fixtures/custom-oll-merge.json');
  await dialog.getByText('JSON 公式', { exact: true }).waitFor();
  const snapshot = await page.evaluate(() => localStorage.getItem('cuberCustomOllLibrary'));
  await file.setInputFiles('/dd/workspace_trae/cuber/scripts/fixtures/custom-oll-bad.json');
  await dialog.getByRole('alert').getByText(/导入失败/).waitFor();
  if (await page.evaluate(() => localStorage.getItem('cuberCustomOllLibrary')) !== snapshot)
    throw Error('错误文件改动了公式库');
  await page.goto(`http://127.0.0.1:18082/?mode=algs&ui-check=oll-transfer-algs-${Date.now()}`);
  await page.getByRole('button', { name: /F2L-/ }).first().click();
  await page.getByRole('tab', { name: '自定义 OLL' }).click();
  await page.getByRole('button', { name: '旧公式 (2)', exact: true }).waitFor();
  await page.evaluate(() => { localStorage.removeItem('cuberCustomOllLibrary'); localStorage.removeItem('seamlessOpSettings'); });
}
