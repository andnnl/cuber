#!/usr/bin/env node
/**
 * cuber 验证 CLI
 * 用于验证求解器的正确性
 */

const { verifySolve, CubeState } = require('./cube');

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法:');
    console.log('  verify <打乱> <求解>  - 验证求解');
    console.log('  apply <操作>          - 应用操作后输出状态');
    console.log('  test                  - 运行测试');
    process.exit(1);
  }
  
  const command = args[0];
  
  switch (command) {
    case 'verify':
      if (args.length < 3) {
        console.log('用法: verify <打乱> <求解>');
        process.exit(1);
      }
      const scramble = args[1];
      const solution = args[2];
      const result = verifySolve(scramble, solution);
      
      console.log('打乱:', scramble);
      console.log('求解:', solution);
      console.log('');
      console.log('打乱后状态:', result.scrambleState);
      console.log('求解后状态:', result.solutionState);
      console.log('');
      console.log('十字已解决:', result.isCrossSolved);
      console.log('完全已解决:', result.isSolved);
      
      if (result.isSolved) {
        console.log('\n✅ 求解正确！');
      } else if (result.isCrossSolved) {
        console.log('\n⚠️ 十字已解决，但未完全解决');
      } else {
        console.log('\n❌ 求解不正确！');
      }
      break;
      
    case 'apply':
      if (args.length < 2) {
        console.log('用法: apply <操作>');
        process.exit(1);
      }
      const movesStr = args[1];
      const state = new CubeState();
      state.applyMoves(movesStr);
      
      console.log('操作:', movesStr);
      console.log('状态:', state.serialize());
      break;
      
    case 'test':
      runTests();
      break;
      
    default:
      console.log('未知命令:', command);
      process.exit(1);
  }
}

function runTests() {
  console.log('=== 运行验证测试 ===\n');
  
  // 测试 1: R 转动
  console.log('测试 1: R 转动');
  const state1 = new CubeState();
  state1.applyMoves('R');
  const result1 = state1.serialize();
  console.log('R 转动后:', result1);
  
  // 验证关键贴纸
  const uFace = result1.slice(0, 9);
  const rFace = result1.slice(9, 18);
  const fFace = result1.slice(18, 27);
  const dFace = result1.slice(27, 36);
  const bFace = result1.slice(45, 54);
  
  console.log('  U面:', uFace);
  console.log('  R面:', rFace);
  console.log('  F面:', fFace);
  console.log('  D面:', dFace);
  console.log('  B面:', bFace);
  console.log('');
  
  // 测试 2: 十字求解验证
  console.log('测试 2: 十字求解');
  const scramble2 = "R D2 R F2 L U2 D U L2 U R2 B2 D' L2 B' U R' F L' F'";
  const solution2 = "U L' D2 F' L' D' L2";
  const result2 = verifySolve(scramble2, solution2);
  
  console.log('打乱:', scramble2);
  console.log('求解:', solution2);
  console.log('十字已解决:', result2.isCrossSolved);
  console.log('');
  
  // 测试 3: R' 是 R 的逆
  console.log('测试 3: R R\' = 已还原');
  const state3 = new CubeState();
  state3.applyMoves('R');
  state3.applyMoves('R\'');
  console.log('R R\' 后状态:', state3.serialize());
  console.log('已还原:', state3.isSolved());
  console.log('');
  
  // 测试 4: R2 R2 = 已还原
  console.log('测试 4: R2 R2 = 已还原');
  const state4 = new CubeState();
  state4.applyMoves('R2');
  state4.applyMoves('R2');
  console.log('R2 R2 后状态:', state4.serialize());
  console.log('已还原:', state4.isSolved());
  console.log('');
  
  console.log('=== 测试完成 ===');
}

main();