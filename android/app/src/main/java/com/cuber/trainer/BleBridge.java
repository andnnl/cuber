package com.cuber.trainer;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 原生 BLE 桥: WebView 内 JS 通过 window.__bleNative 调用 (5 个 @JavascriptInterface 方法),
 * Java 通过 evaluateJavascript 回调 window.__ble.dispatch(type, payloadJson)。
 *
 * JS → Java:
 *   scan()                       开始 BLE 扫描 (结果经 "scan" 事件逐个上报)
 *   stopScan()                   停止扫描
 *   connect(address)             GATT 连接 + 服务发现 + 订阅全部通知特征 ("services" 事件)
 *   disconnect()                 断开 GATT ("disconnected" 事件)
 *   write(charUuid, base64)      写特征 (Android 内部排队, 避免 BLE 单写窗口冲突)
 *
 * Java → JS:
 *   scan         {address, name}
 *   services     {services: [{uuid, notify: [], write: []}]}
 *   notify       {data: base64}
 *   disconnected {}
 *   error        {message}     ("蓝牙未开启" 会自动拉起系统开启弹窗)
 *   bluetoothOn  {}
 */
public class BleBridge {

    private static final String TAG = "BleBridge";
    public static final int REQ_PERMISSIONS = 4101;
    private static final int REQ_ENABLE_BT = 4102;
    private static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Activity activity;
    private final WebView webView;
    private final BluetoothAdapter adapter;

    private BluetoothGatt gatt;
    private boolean scanning;
    /** 扫描结果 (保持发现顺序, JS 侧展示用) */
    private final Map<String, String> scanResults = new LinkedHashMap<>();
    /** 待订阅通知特征队列 (CCCD 写入必须串行) */
    private final List<BluetoothGattCharacteristic> notifyQueue = new ArrayList<>();
    /** 服务发现结果 JSON (订阅完成后随 "services" 事件上报) */
    private JSONArray pendingServices;
    /** 写命令队列 */
    private final List<String> writeUuids = new ArrayList<>();
    private final List<byte[]> writeDatas = new ArrayList<>();
    /** 权限申请前的意图: "scan" 或目标设备地址 */
    private String pendingAction = "";

    public BleBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        BluetoothManager manager = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
        this.adapter = manager == null ? null : manager.getAdapter();
    }

    // ================= JS 接口 (5 个方法) =================

    @JavascriptInterface
    public void scan() {
        activity.runOnUiThread(this::startScanWithPermission);
    }

    @JavascriptInterface
    public void stopScan() {
        activity.runOnUiThread(this::stopScanInternal);
    }

    @JavascriptInterface
    public void connect(final String address) {
        activity.runOnUiThread(() -> {
            if (adapter == null) {
                dispatchError("设备不支持蓝牙");
                return;
            }
            if (!adapter.isEnabled()) {
                dispatchError("蓝牙未开启");
                return;
            }
            if (!ensurePermissions()) {
                pendingAction = address == null ? "" : address;
                return;
            }
            connectInternal(address);
        });
    }

    @JavascriptInterface
    public void disconnect() {
        activity.runOnUiThread(() -> {
            stopScanInternal();
            if (gatt != null) {
                gatt.disconnect(); // STATE_DISCONNECTED 回调里 close + 上报
            }
        });
    }

    @JavascriptInterface
    public void write(final String charUuid, final String base64) {
        activity.runOnUiThread(() -> writeInternal(charUuid, base64));
    }

    // ================= 权限 / 蓝牙开关 =================

    /** 权限齐备返回 true; 缺失时发起申请并返回 false (结果经 onPermissionResult 续行) */
    private boolean ensurePermissions() {
        List<String> missing = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            addIfMissing(missing, Manifest.permission.BLUETOOTH_CONNECT);
            addIfMissing(missing, Manifest.permission.BLUETOOTH_SCAN);
        } else {
            addIfMissing(missing, Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (missing.isEmpty()) {
            return true;
        }
        activity.requestPermissions(missing.toArray(new String[0]), REQ_PERMISSIONS);
        return false;
    }

    private void addIfMissing(List<String> list, String perm) {
        if (activity.checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
            list.add(perm);
        }
    }

    /** MainActivity.onRequestPermissionsResult 转发 */
    public void onPermissionResult(boolean granted) {
        if (!granted) {
            dispatchError("未授予蓝牙权限, 无法扫描/连接魔方");
            return;
        }
        if ("scan".equals(pendingAction)) {
            startScanWithPermission();
        } else if (!pendingAction.isEmpty()) {
            connectInternal(pendingAction);
        }
        pendingAction = "";
    }

    /** MainActivity.onActivityResult 转发 (REQ_ENABLE_BT) */
    public void onActivityResult(int requestCode, int resultCode) {
        if (requestCode == REQ_ENABLE_BT && resultCode == Activity.RESULT_OK) {
            dispatch("bluetoothOn", new JSONObject());
        }
    }

    // ================= 扫描 =================

    private void startScanWithPermission() {
        if (adapter == null) {
            dispatchError("设备不支持蓝牙");
            return;
        }
        if (!adapter.isEnabled()) {
            // 拉起系统开启弹窗, 开启后 JS 收到 bluetoothOn 可提示重试
            dispatchError("蓝牙未开启");
            activity.startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_ENABLE_BT);
            return;
        }
        if (!ensurePermissions()) {
            pendingAction = "scan";
            return;
        }
        startScanInternal();
    }

    @SuppressLint("MissingPermission")
    private void startScanInternal() {
        if (scanning) {
            return;
        }
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            dispatchError("BLE 扫描不可用");
            return;
        }
        scanResults.clear();
        scanning = true;
        try {
            scanner.startScan(scanCallback);
            dispatch("scanStart", new JSONObject());
        } catch (SecurityException e) {
            scanning = false;
            dispatchError("权限不足: " + e.getMessage());
        }
    }

    private void stopScanInternal() {
        if (!scanning || adapter == null) {
            return;
        }
        try {
            BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
            if (scanner != null) {
                scanner.stopScan(scanCallback);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "stopScan: " + e.getMessage());
        }
        scanning = false;
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = null;
            try {
                name = device.getName(); // API 31+ 需要 BLUETOOTH_CONNECT
            } catch (SecurityException e) {
                return;
            }
            if (name == null || name.isEmpty()) {
                return; // 无名设备不展示 (魔方广播都带名字)
            }
            String address = device.getAddress();
            if (scanResults.containsKey(address)) {
                return;
            }
            scanResults.put(address, name);
            try {
                dispatch("scan", new JSONObject()
                        .put("address", address)
                        .put("name", name));
            } catch (Exception ignored) {
            }
        }
    };

    // ================= GATT 连接 =================

    private void connectInternal(String address) {
        stopScanInternal();
        closeGatt();
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            gatt = device.connectGatt(activity, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException e) {
            dispatchError("权限不足: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            dispatchError("非法设备地址: " + address);
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                try {
                    g.discoverServices();
                } catch (SecurityException e) {
                    dispatchError("权限不足: " + e.getMessage());
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                closeGatt();
                dispatch("disconnected", new JSONObject());
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                dispatchError("服务发现失败 (status=" + status + ")");
                return;
            }
            // 枚举服务/特征: 通知特征排队订阅, 其余上报给 JS 做代际识别与写特征选择
            notifyQueue.clear();
            JSONArray services = new JSONArray();
            try {
                for (BluetoothGattService s : g.getServices()) {
                    JSONArray notify = new JSONArray();
                    JSONArray write = new JSONArray();
                    for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                        int props = c.getProperties();
                        String u = c.getUuid().toString();
                        if ((props & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
                            notify.put(u);
                            notifyQueue.add(c);
                        }
                        if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                                || (props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                            write.put(u);
                        }
                    }
                    if (notify.length() == 0 && write.length() == 0) {
                        continue;
                    }
                    services.put(new JSONObject()
                            .put("uuid", s.getUuid().toString())
                            .put("notify", notify)
                            .put("write", write));
                }
            } catch (Exception e) {
                dispatchError("服务枚举异常: " + e.getMessage());
                return;
            }
            pendingServices = services;
            enableNextNotification();
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor descriptor, int status) {
            enableNextNotification();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            // 写完成 → 派发队列里的下一条 (Android 同时只允许一个在途写)
            nextWrite();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            // API < 33: 旧签名 (值需经 characteristic.getValue() 取)
            try {
                dispatchNotify(c.getValue());
            } catch (SecurityException ignored) {
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            // API 33+ (targetSdk 33+ 起框架只调此签名)
            dispatchNotify(value);
        }
    };

    /** 串行订阅: setCharacteristicNotification + 写 CCCD, 完成后队列下一个; 空了上报 services */
    @SuppressLint("MissingPermission")
    private void enableNextNotification() {
        if (gatt == null) {
            return;
        }
        if (notifyQueue.isEmpty()) {
            JSONArray services = pendingServices;
            pendingServices = null;
            if (services != null) {
                try {
                    dispatch("services", new JSONObject().put("services", services));
                } catch (Exception ignored) {
                }
            }
            return;
        }
        BluetoothGattCharacteristic c = notifyQueue.remove(0);
        try {
            gatt.setCharacteristicNotification(c, true);
            BluetoothGattDescriptor cccd = c.getDescriptor(CCCD_UUID);
            if (cccd == null) {
                enableNextNotification();
                return;
            }
            boolean ok;
            if (Build.VERSION.SDK_INT >= 33) {
                // API 33+: writeDescriptor 返回 int 状态码
                ok = gatt.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        == BluetoothGatt.GATT_SUCCESS;
            } else {
                cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                ok = gatt.writeDescriptor(cccd);
            }
            if (!ok) {
                enableNextNotification();
            }
        } catch (SecurityException e) {
            dispatchError("权限不足: " + e.getMessage());
        }
    }

    // ================= 写命令 (排队) =================

    private void writeInternal(String charUuid, String base64) {
        if (gatt == null) {
            dispatchError("未连接");
            return;
        }
        if (charUuid == null || base64 == null) {
            return;
        }
        byte[] data;
        try {
            data = Base64.decode(base64, Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            return;
        }
        if (writeDatas.isEmpty()) {
            if (doWrite(charUuid, data)) {
                return;
            }
        }
        // 队列 (在途写存在或本次下发失败重试)
        writeUuids.add(charUuid);
        writeDatas.add(data);
    }

    @SuppressLint("MissingPermission")
    private boolean doWrite(String charUuid, byte[] data) {
        BluetoothGattCharacteristic target = findCharacteristic(charUuid);
        if (target == null) {
            dispatchError("找不到写特征: " + charUuid);
            return true; // 视为已消费, 避免死循环重试
        }
        try {
            // 按特征属性选择写类型 (GAN 命令特征可能是 WRITE 或 WRITE_NO_RESPONSE)
            boolean withResponse = (target.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            if (Build.VERSION.SDK_INT >= 33) {
                // API 33+: writeCharacteristic 返回 int 状态码
                int result = gatt.writeCharacteristic(target, data,
                        withResponse ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                                : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                return result == BluetoothGatt.GATT_SUCCESS;
            }
            target.setValue(data);
            target.setWriteType(withResponse ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            return gatt.writeCharacteristic(target);
        } catch (SecurityException e) {
            dispatchError("权限不足: " + e.getMessage());
            return true;
        }
    }

    private void nextWrite() {
        if (gatt == null || writeUuids.isEmpty()) {
            writeDatas.clear();
            writeUuids.clear();
            return;
        }
        String uuid = writeUuids.remove(0);
        byte[] data = writeDatas.remove(0);
        if (!doWrite(uuid, data)) {
            // 仍在途? 重新排队头部位 (顺序保持)
            writeUuids.add(0, uuid);
            writeDatas.add(0, data);
        }
    }

    private BluetoothGattCharacteristic findCharacteristic(String uuid) {
        try {
            BluetoothGattService s = gatt.getService(UUID.fromString(uuid));
            if (s != null) {
                return s.getCharacteristic(UUID.fromString(uuid));
            }
            for (BluetoothGattService service : gatt.getServices()) {
                BluetoothGattCharacteristic c = service.getCharacteristic(UUID.fromString(uuid));
                if (c != null) {
                    return c;
                }
            }
        } catch (IllegalArgumentException ignored) {
        }
        return null;
    }

    // ================= 资源清理 / 上报 =================

    private void closeGatt() {
        if (gatt != null) {
            try {
                gatt.close();
            } catch (SecurityException ignored) {
            }
            gatt = null;
        }
        notifyQueue.clear();
        pendingServices = null;
        writeDatas.clear();
        writeUuids.clear();
    }

    private void dispatchNotify(byte[] value) {
        if (value == null || value.length == 0) {
            return;
        }
        try {
            dispatch("notify", new JSONObject().put("data", Base64.encodeToString(value, Base64.NO_WRAP)));
        } catch (Exception ignored) {
        }
    }

    private void dispatchError(String message) {
        try {
            dispatch("error", new JSONObject().put("message", message));
        } catch (Exception ignored) {
        }
    }

    /** 回调 JS: window.__ble.dispatch(type, payloadJson) (必须 UI 线程) */
    private void dispatch(final String type, final JSONObject payload) {
        final String js = "window.__ble&&window.__ble.dispatch("
                + JSONObject.quote(type) + "," + JSONObject.quote(payload.toString()) + ");";
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }
}
