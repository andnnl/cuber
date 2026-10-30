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
    op.setStep(1);
    opCube.twister.finish();
    const opStepStart = opCube.serialize();
    const opDuringStep = await move('D', opCube);
    op.retry();
    const opRetry = opCube.serialize();

    shell.navigate({ mode: 'pll6' });
    await shell.$nextTick();
    shell.setFollowing(true);
    const pll = shell.$refs.activeView;
    pll.retry();
    const pllCube = pll.world.cube;
    const pllStart = pllCube.serialize();
    const pllCase = pll.training.current;
    const pllFeatureBefore = pll.actualFeature?.six;
    const pllMoved = await move('F', pllCube);
    await new Promise(resolve => setTimeout(resolve, 250));
    const pllFeatureAfter = pll.actualFeature?.six;
    const opBackground = opCube.serialize();
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
      opStart, opMoved, opCaseStable, opClosed, opPlaying, opStepStart, opDuringStep, opRetry, opBackground,
      pllStart, pllMoved, pllCaseStable: pll.training.current === pllCase,
      pllClosedStart, pllClosed, timerWithFollowOff, replayStart, replayAfterMove,
      opControl, pllFeatureBefore, pllFeatureAfter,
    };
  });
  if (result.opStart === result.opMoved) throw new Error(`无缝 OP 实时转动未更新 3D：${JSON.stringify(result)}`);
  if (!result.opCaseStable || result.opClosed !== result.opMoved || result.opPlaying !== result.opMoved ||
    result.opStepStart !== result.opDuringStep || result.opRetry !== result.opStart || result.opBackground !== result.opRetry)
    throw new Error(`无缝 OP 画面与判题相互干扰：${JSON.stringify(result)}`);
  if (result.pllStart === result.pllMoved || !result.pllCaseStable || result.pllClosed !== result.pllClosedStart ||
    !result.timerWithFollowOff || result.replayStart !== result.replayAfterMove || !result.opControl ||
    result.pllFeatureBefore !== result.pllFeatureAfter)
    throw new Error(`六格跟随、计时或复盘保护异常：${JSON.stringify(result)}`);
  await page.goto('http://127.0.0.1:18082/?mode=pll6');
  await page.waitForFunction(() => window.__appShell?.activeMode === 'pll6');
  const solvedWithoutFollow = await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    shell.setFollowing(false);
    const vm = shell.$refs.activeView;
    const count = vm.records.length;
    shell.session.mockApplyFormula('R');
    await new Promise(resolve => setTimeout(resolve, 120));
    shell.session.mockApplyFormula("R'");
    await new Promise(resolve => setTimeout(resolve, 180));
    return { before: count, after: vm.records.length, status: shell.snapshot.status };
  });
  if (solvedWithoutFollow.after !== solvedWithoutFollow.before + 1 || solvedWithoutFollow.status !== 'connected')
    throw new Error(`六格关闭画面跟随后六面还原未进入下一题：${JSON.stringify(solvedWithoutFollow)}`);
  return '无缝 OP 与六格实时预览、独立计时判定通过';
}
