#!/usr/bin/env python3
"""
Cuber 3D 可视化服务器启动脚本

启动 webpack 开发服务器，自动设置 NODE_OPTIONS 环境变量
解决 Node.js 22 的 OpenSSL 兼容性问题

使用方法:
    python3 start_server.py [--port PORT] [--host HOST]

默认:
    port: 8080
    host: 0.0.0.0 (允许外部访问)

启动后访问:
    http://localhost:8080                    - 主界面
    http://localhost:8080/?mode=playground   - 练习模式
    http://localhost:8080/?mode=director     - 动画制作模式
    http://localhost:8080/?mode=player&data=... - 播放动画
"""

import os
import subprocess
import sys
import argparse
import signal
import time

def main():
    parser = argparse.ArgumentParser(description="启动 Cuber 3D 可视化服务器")
    parser.add_argument("--port", type=int, default=8080, help="服务器端口 (默认: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="服务器主机 (默认: 0.0.0.0)")
    args = parser.parse_args()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    env = os.environ.copy()
    env["NODE_OPTIONS"] = "--openssl-legacy-provider"
    
    print("=" * 60)
    print("Cuber 3D 可视化服务器")
    print("=" * 60)
    print()
    print(f"端口: {args.port}")
    print(f"主机: {args.host}")
    print()
    print("启动后访问:")
    print(f"  http://localhost:{args.port}                    - 主界面")
    print(f"  http://localhost:{args.port}?mode=playground   - 练习模式")
    print(f"  http://localhost:{args.port}?mode=director     - 动画制作")
    print(f"  http://localhost:{args.port}?mode=player&data=... - 播放动画")
    print()
    print("注意: 服务器启动需要 10-20 秒编译时间")
    print("按 Ctrl+C 停止服务器")
    print("=" * 60)
    print()
    
    cmd = [
        "npm", "run", "watch"
    ]
    
    try:
        process = subprocess.Popen(cmd, env=env)
        process.wait()
    except KeyboardInterrupt:
        print()
        print("正在停止服务器...")
        process.terminate()
        process.wait()
        print("服务器已停止")
    except Exception as e:
        print(f"启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()