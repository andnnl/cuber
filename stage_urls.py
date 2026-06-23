import urllib.parse

scramble = "B2 D2 F' R2 D2 B' L2 U R2 U' L2 B D' F U' R' U2 F' R D' B'"

stages = {
    "十字": "B' R2 L2 F D2",
    "F2L_FR": "F B' D' L' R2 D R2 B2 R2 B'",
    "F2L_FL": "D' B2 D B2 L B L' B",
    "F2L_BR": "R D B D F L2 F' D2 R'",
    "F2L_BL": "B2 D F2 D' B2 D F2 D'",
    "OLL": "F U R U' R2 F' R U R U' R'",
}

cumulative_solutions = {
    "十字": stages["十字"],
    "十字+F2L_FR": stages["十字"] + " " + stages["F2L_FR"],
    "十字+F2L_FR+FL": stages["十字"] + " " + stages["F2L_FR"] + " " + stages["F2L_FL"],
    "十字+F2L_FR+FL+BR": stages["十字"] + " " + stages["F2L_FR"] + " " + stages["F2L_FL"] + " " + stages["F2L_BR"],
    "完整解法": stages["十字"] + " " + stages["F2L_FR"] + " " + stages["F2L_FL"] + " " + stages["F2L_BR"] + " " + stages["F2L_BL"] + " " + stages["OLL"],
}

scramble_encoded = urllib.parse.quote(scramble)

print("=" * 70)
print("分阶段验证链接")
print("=" * 70)
print()

for stage_name, solution in cumulative_solutions.items():
    solution_encoded = urllib.parse.quote(solution)
    
    twizzle_url = f"https://alpha.twizzle.net/edit/?setup-alg={scramble_encoded}&alg={solution_encoded}"
    
    print(f"【{stage_name}】")
    print(f"解法: {solution}")
    print(f"链接: {twizzle_url}")
    print()

print("=" * 70)
print("单阶段验证链接")
print("=" * 70)
print()

for stage_name, solution in stages.items():
    solution_encoded = urllib.parse.quote(solution)
    
    twizzle_url = f"https://alpha.twizzle.net/edit/?alg={solution_encoded}"
    
    print(f"【{stage_name}】")
    print(f"解法: {solution}")
    print(f"链接 (从已解状态开始): {twizzle_url}")
    print()