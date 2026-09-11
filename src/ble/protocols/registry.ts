// 协议注册表: 服务 UUID → 协议元数据 (供 UI 展示与原生桥过滤使用)
// 传输层只看字节流, 代际识别在 GanCubeLink.connect 后由 serviceUuids 完成

import { ProtocolMeta } from "../types";
import {
  GAN_GEN2_SERVICE,
  GAN_GEN2_COMMAND_CHARACTERISTIC,
  GAN_GEN2_STATE_CHARACTERISTIC,
  GAN_GEN3_SERVICE,
  GAN_GEN3_COMMAND_CHARACTERISTIC,
  GAN_GEN3_STATE_CHARACTERISTIC,
  GAN_GEN4_SERVICE,
  GAN_GEN4_COMMAND_CHARACTERISTIC,
  GAN_GEN4_STATE_CHARACTERISTIC,
} from "./vendor/gan-cube-definitions";

export const PROTOCOLS: ProtocolMeta[] = [
  {
    brand: "GAN Gen2",
    serviceUuid: GAN_GEN2_SERVICE,
    notifyUuids: [GAN_GEN2_STATE_CHARACTERISTIC],
    writeUuid: GAN_GEN2_COMMAND_CHARACTERISTIC,
    supported: true,
  },
  {
    brand: "GAN Gen3",
    serviceUuid: GAN_GEN3_SERVICE,
    notifyUuids: [GAN_GEN3_STATE_CHARACTERISTIC],
    writeUuid: GAN_GEN3_COMMAND_CHARACTERISTIC,
    supported: true,
  },
  {
    brand: "GAN Gen4",
    serviceUuid: GAN_GEN4_SERVICE,
    notifyUuids: [GAN_GEN4_STATE_CHARACTERISTIC],
    writeUuid: GAN_GEN4_COMMAND_CHARACTERISTIC,
    supported: true,
  },
];

/** 按服务 UUID 查协议 (大小写不敏感) */
export function findProtocolByService(uuid: string): ProtocolMeta | null {
  const u = (uuid || "").toLowerCase();
  return PROTOCOLS.find((p) => p.serviceUuid.toLowerCase() === u) ?? null;
}
