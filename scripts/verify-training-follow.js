async page => {
  await page.goto('http://127.0.0.1:18082/?mode=seamlessop');
  await page.waitForFunction(() => window.__appShell?.activeMode === 'seamlessop');
  const result = await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    const waitMove = () => new Promise(resolve => setTimeout(resolve, 180));
    const move = async (formula, cube) => {
      shell.session.mockApplyFormula(formula);
      await waitMove();
      cube.twister.finish();
      return cube.serialize();
    };
    const op = shell.$refs.activeView;
    const opControl = !!document.querySelector('[data-global-follow]');
    const opCube = op.world.cube;
    const originalCase = op.current;
    const opStart = opCube.serialize();
    const opMoved = await move('R', opCube);
    const opCaseStable = op.current === originalCase && op.step === 0 && !op.revealed;
    shell.setFollowing(false);
    const opClosed = await move('U', opCube);
    shell.setFollowing(true);
    op.playing = true;
    const opPlaying = await move('L', opCube);
    op.playing = false;
    op.retry();
    const opRetry = opCube.serialize();

    shell.navigate({ mode: 'pll6' });
    await shell.$nextTick();
    const pll = shell.$refs.activeView;
    pll.retry();
    const pllCube = pll.world.cube;
    const pllStart = pllCube.serialize();
    const pllCase = pll.training.current;
    const pllFeatureBefore = pll.actualFeature?.six;
    const pllMoved = await move('F', pllCube);
    await new Promise(resolve => setTimeout(resolve, 250));
    const pllFeatureAfter = pll.actualFeature?.six;
    shell.setFollowing(false);
    pll.retry();
    const pllClosedStart = pllCube.serialize();
    const pllClosed = await move('B', pllCube);
    const timerWithFollowOff = pll.training.startedAt !== null;
    shell.setFollowing(true);
    pll.replayRecord = { name: pll.training.current.name, scramble: pll.scramble };
    const replayStart = pllCube.serialize();
    const replayAfterMove = await move('D', pllCube);
    pll.replayRecord = null;
    pll.retry();
    return {
      opStart, opMoved, opCaseStable, opClosed, opPlaying, opRetry,
      pllStart, pllMoved, pllCaseStable: pll.training.current === pllCase,
      pllClosedStart, pllClosed, timerWithFollowOff, replayStart, replayAfterMove,
      opControl, pllFeatureBefore, pllFeatureAfter,
    };
  });
  if (result.opStart === result.opMoved) throw new Error(`无缝 OP 实时转动未更新 3D：${JSON.stringify(result)}`);
  if (!result.opCaseStable || result.opClosed !== result.opMoved || result.opPlaying !== result.opMoved || result.opRetry !== result.opStart)
    throw new Error(`无缝 OP 画面与判题相互干扰：${JSON.stringify(result)}`);
  if (result.pllStart === result.pllMoved || !result.pllCaseStable || result.pllClosed !== result.pllClosedStart ||
    !result.timerWithFollowOff || result.replayStart !== result.replayAfterMove || !result.opControl ||
    result.pllFeatureBefore !== result.pllFeatureAfter)
    throw new Error(`六格跟随、计时或复盘保护异常：${JSON.stringify(result)}`);
}
