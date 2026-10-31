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
  {
    brand: "MoYu32",
    serviceUuid: "0783b03e-7735-b5a0-1760-a305d2795cb0",
    notifyUuids: ["0783b03e-7735-b5a0-1760-a305d2795cb1"],
    writeUuid: "0783b03e-7735-b5a0-1760-a305d2795cb2",
    supported: true,
  },
  {
    brand: "QiYi",
    serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
    notifyUuids: ["0000fff6-0000-1000-8000-00805f9b34fb"],
    writeUuid: "0000fff6-0000-1000-8000-00805f9b34fb",
    supported: true,
  },
];

export function isCubeName(name: string): boolean {
  const value = (name || "").trim();
  return !/^GAN[ -]?(Robot|Bot)/i.test(value) &&
    /^(GAN|MG|AiCube|WCU_MY32|QY-QYSC|XMD-TornadoV4-i)/i.test(value);
}

export function findCubeProtocol(info: { name: string; serviceUuids: string[]; notifyUuids?: string[] }): ProtocolMeta | null {
  if (/^(GAN[ -]?(Robot|Bot)|QiYi Smart Timer)/i.test((info.name || "").trim())) return null;
  const services = info.serviceUuids.map(uuid => uuid.toLowerCase());
  const name = (info.name || "").trim().toUpperCase();
  return PROTOCOLS.find(meta => {
    if (services.indexOf(meta.serviceUuid.toLowerCase()) < 0) return false;
    if (meta.brand === "MoYu32" && !name.startsWith("WCU_MY32")) return false;
    if (meta.brand === "QiYi" && !(name.startsWith("QY-QYSC") || name.startsWith("XMD-TORNADOV4-I"))) return false;
    return !info.notifyUuids || meta.notifyUuids.some(uuid => info.notifyUuids!.some(n => n.toLowerCase() === uuid.toLowerCase()));
  }) || null;
}

/** 按服务 UUID 查协议 (大小写不敏感) */
export function findProtocolByService(uuid: string): ProtocolMeta | null {
  const u = (uuid || "").toLowerCase();
  return PROTOCOLS.find((p) => p.serviceUuid.toLowerCase() === u) ?? null;
}
