import urllib.parse

scramble = "B2 D2 F' R2 D2 B' L2 U R2 U' L2 B D' F U' R' U2 F' R D' B'"
solution = "B' R2 L2 F D2 F B' D' L' R2 D R2 B2 R2 B' D' B2 D B2 L B L' B R D B D F L2 F' D2 R' B2 D F2 D' B2 D F2 D' R' U' F' U F R"

scramble_encoded = urllib.parse.quote(scramble)
solution_encoded = urllib.parse.quote(solution)

print("=== Twizzle 动画链接 ===")
print()
print(f"https://alpha.twizzle.net/edit/?setup-alg={scramble_encoded}&alg={solution_encoded}")
print()
print("=== AnimCubeJS 链接 ===")
print()
animcube_url = f"https://animcubejs.cubing.net/cube3.html?initmove={scramble_encoded}&initrevmove=#&move={solution_encoded}"
print(animcube_url)