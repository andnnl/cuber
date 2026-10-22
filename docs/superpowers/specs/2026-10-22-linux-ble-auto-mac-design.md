# Linux 桌面版自动获取蓝牙 MAC：设计规格

## 目标

与 Windows 桌面版相同：首次在 Electron 的 Web Bluetooth 选择框中点选魔方，尽量自动取得 GAN 解密所需的 MAC，避免人工输入。保留现有广播观察和手动输入兜底，不改 Web Bluetooth GATT 通信。

## 方案

随 AppImage 打包一个使用 GIO 访问系统 BlueZ D-Bus 的辅助程序。选择框打开时启动，在有界时间内扫描新增的 `org.bluez.Device1` 和本轮广播属性更新；已缓存但本轮未广播的 BlueZ 历史设备不可作为候选。读取名称、地址和 ManufacturerData：GAN CIC 低字节为 `0x01` 且载荷至少九字节时，使用第 4～9 字节逆序的稳定加密 MAC；否则使用 BlueZ Address。JSONL 输出 `{name,mac,address,source}` 给现有 `NativeScan`，保持相同名称唯一匹配、设备 ID 缓存和成功解析后验证缓存的约束。关闭选择框停止子进程和发现；BlueZ 不可用或有歧义时不猜测，沿用广播／手填路径。

Linux 构建必须先编译辅助程序，再以 `extraResources` 打入 AppImage；CI 校验发布包确有可执行文件。Windows 构建路径保持不变。桌面测试覆盖路径、平台门控、同名多地址拒绝、厂商数据 MAC 优先；本机可编译与运行自检，但实体设备扫描、连接和转动仍需 Linux 蓝牙环境验收。
