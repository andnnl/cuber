// Generate Cuber 3D animation URL
// Usage: node generate_animation.js "打乱" "解法"

const scramble = process.argv[2] || "B2 D2 F' R2 D2 B' L2 U R2 U' L2 B D' F U' R' U2 F' R D' B'";
const solution = process.argv[3] || "";

const data = {
  order: 3,
  drama: {
    scene: scramble,
    action: solution
  }
};

const jsonString = JSON.stringify(data);
const base64 = Buffer.from(jsonString).toString('base64');

// Cuber 本地路径
const localUrl = `http://localhost:8080/?mode=player&data=${base64}`;

console.log("=== Cuber 3D Animation URL ===");
console.log("");
console.log("打乱:", scramble);
console.log("解法:", solution);
console.log("");
console.log("动画链接 (本地):");
console.log(localUrl);
console.log("");
console.log("Base64 数据:", base64);
console.log("");
console.log("JSON 数据:", jsonString);