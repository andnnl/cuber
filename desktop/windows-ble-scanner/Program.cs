using System.Text.Json;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Foundation;
using Windows.Storage.Streams;

// Private line-delimited JSON bridge: the radio address selects a GATT device,
// while GAN manufacturer bytes contain the possibly different encryption MAC.
var bridge = new BleBridge();
await bridge.RunAsync();

sealed class BleBridge
{
    // Match the Web Bluetooth protocol registry: never enumerate or subscribe to unrelated services.
    private static readonly (Guid Service, Guid State, Guid Command)[] GanGatt =
    [
        (Guid.Parse("6e400001-b5a3-f393-e0a9-e50e24dc4179"), Guid.Parse("28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4"), Guid.Parse("28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4")),
        (Guid.Parse("8653000a-43e6-47b7-9cb0-5fc21d4ae340"), Guid.Parse("8653000b-43e6-47b7-9cb0-5fc21d4ae340"), Guid.Parse("8653000c-43e6-47b7-9cb0-5fc21d4ae340")),
        (Guid.Parse("00000010-0000-fff7-fff6-fff5fff4fff0"), Guid.Parse("0000fff6-0000-1000-8000-00805f9b34fb"), Guid.Parse("0000fff5-0000-1000-8000-00805f9b34fb")),
    ];
    private record Candidate(string Name, ulong RadioAddress, BluetoothAddressType AddressType, string Mac);
    private record Pending(string? Name, string? Mac);
    private readonly object gate = new();
    private readonly Dictionary<string, Candidate> candidates = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Pending> pending = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, GattCharacteristic> writable = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<(GattCharacteristic Characteristic,
        TypedEventHandler<GattCharacteristic, GattValueChangedEventArgs> Handler)> subscriptions = new();
    private readonly BluetoothLEAdvertisementWatcher watcher = new() { ScanningMode = BluetoothLEScanningMode.Active };
    private BluetoothLEDevice? device;
    private int generation;

    public BleBridge() { watcher.Received += OnAdvertisement; }

    private static string FormatMac(IEnumerable<byte> bytes) => string.Join(":", bytes.Select(b => b.ToString("X2")));
    private static string RadioMac(ulong address) => FormatMac(Enumerable.Range(0, 6)
        .Select(i => (byte)(address >> ((5 - i) * 8))));

    private static string? EncryptionMac(BluetoothLEAdvertisementReceivedEventArgs args)
    {
        foreach (var data in args.Advertisement.ManufacturerData)
        {
            if ((data.CompanyId & 0xFF) != 1 || data.Data.Length < 9) continue;
            var bytes = new byte[data.Data.Length];
            DataReader.FromBuffer(data.Data).ReadBytes(bytes);
            return FormatMac(bytes.Take(9).Skip(3).Reverse());
        }
        return null;
    }

    private void Emit(string type, object payload)
    {
        lock (gate) Console.WriteLine(JsonSerializer.Serialize(new { type, payload }));
    }

    private void Error(string message, int? forGeneration = null)
    {
        if (forGeneration == null) Emit("error", new { message });
        else Emit("error", new { message, generation = forGeneration.Value });
    }

    private void OnAdvertisement(BluetoothLEAdvertisementWatcher _, BluetoothLEAdvertisementReceivedEventArgs args)
    {
        try
        {
            var name = args.Advertisement.LocalName;
            var mac = EncryptionMac(args);
            var radio = RadioMac(args.BluetoothAddress);
            lock (gate)
            {
                if (pending.Count >= 128 && !pending.ContainsKey(radio)) return;
                pending.TryGetValue(radio, out var old);
                name = !string.IsNullOrWhiteSpace(name) ? name : old?.Name;
                mac ??= old?.Mac;
                pending[radio] = new Pending(name, mac);
                if (string.IsNullOrWhiteSpace(name) || name.Length > 100 || mac == null ||
                    !(name.StartsWith("GAN", StringComparison.OrdinalIgnoreCase) ||
                      name.StartsWith("MG", StringComparison.OrdinalIgnoreCase) ||
                      name.StartsWith("AiCube", StringComparison.OrdinalIgnoreCase))) return;
                candidates[radio] = new Candidate(name, args.BluetoothAddress, args.BluetoothAddressType, mac);
            }
            Emit("scan", new { address = radio, name, mac });
        }
        catch (Exception ex) { Console.Error.WriteLine($"[scan] {ex.Message}"); }
    }

    private void StopScan()
    {
        if (watcher.Status == BluetoothLEAdvertisementWatcherStatus.Started) watcher.Stop();
    }

    private void Disconnect()
    {
        foreach (var (characteristic, handler) in subscriptions) characteristic.ValueChanged -= handler;
        subscriptions.Clear();
        writable.Clear();
        if (device != null)
        {
            device.ConnectionStatusChanged -= OnConnectionStatus;
            device.Dispose();
            device = null;
        }
    }

    private void OnConnectionStatus(BluetoothLEDevice sender, object _)
    {
        if (sender == device && sender.ConnectionStatus == BluetoothConnectionStatus.Disconnected)
            Emit("disconnected", new { generation });
    }

    private async Task ConnectAsync(string address, int requestedGeneration)
    {
        StopScan();
        Candidate? selected;
        lock (gate) candidates.TryGetValue(address, out selected);
        if (selected == null) { Error("设备已离开扫描范围，请重新扫描后选择", requestedGeneration); return; }
        var stage = "打开设备";
        try
        {
            Disconnect();
            generation = requestedGeneration;
            var current = await BluetoothLEDevice.FromBluetoothAddressAsync(selected.RadioAddress, selected.AddressType);
            if (current == null) throw new InvalidOperationException("Windows 无法打开所选蓝牙设备");
            if (generation != requestedGeneration) { current.Dispose(); return; }
            device = current;
            current.ConnectionStatusChanged += OnConnectionStatus;
            var services = new List<object>();
            foreach (var protocol in GanGatt)
            {
                stage = $"发现 GAN 服务 {protocol.Service}";
                var discovered = await current.GetGattServicesForUuidAsync(protocol.Service, BluetoothCacheMode.Uncached);
                if (generation != requestedGeneration) return;
                if (discovered.Status != GattCommunicationStatus.Success)
                    throw new InvalidOperationException($"GATT 服务发现失败: {discovered.Status}");
                foreach (var service in discovered.Services)
                {
                    stage = $"枚举 GAN 特征 {protocol.Service}";
                    var found = await service.GetCharacteristicsAsync(BluetoothCacheMode.Uncached);
                    if (generation != requestedGeneration) return;
                    if (found.Status != GattCommunicationStatus.Success)
                        throw new InvalidOperationException($"GATT 特征发现失败: {found.Status}");
                    var notify = new List<string>();
                    var write = new List<string>();
                    foreach (var characteristic in found.Characteristics)
                    {
                        var properties = characteristic.CharacteristicProperties;
                        if (characteristic.Uuid == protocol.Command &&
                            (properties & (GattCharacteristicProperties.Write | GattCharacteristicProperties.WriteWithoutResponse)) != 0)
                        {
                            write.Add(characteristic.Uuid.ToString());
                            writable[characteristic.Uuid.ToString()] = characteristic;
                        }
                        if (characteristic.Uuid != protocol.State) continue;
                        var mode = (properties & GattCharacteristicProperties.Notify) != 0
                            ? GattClientCharacteristicConfigurationDescriptorValue.Notify
                            : (properties & GattCharacteristicProperties.Indicate) != 0
                            ? GattClientCharacteristicConfigurationDescriptorValue.Indicate
                            : GattClientCharacteristicConfigurationDescriptorValue.None;
                        if (mode == GattClientCharacteristicConfigurationDescriptorValue.None) continue;
                        TypedEventHandler<GattCharacteristic, GattValueChangedEventArgs> handler = (_, args) =>
                        {
                            if (generation != requestedGeneration) return;
                            var bytes = new byte[args.CharacteristicValue.Length];
                            DataReader.FromBuffer(args.CharacteristicValue).ReadBytes(bytes);
                            Emit("notify", new { generation = requestedGeneration, data = Convert.ToBase64String(bytes) });
                        };
                        characteristic.ValueChanged += handler;
                        stage = $"订阅 GAN 通知 {characteristic.Uuid}";
                        var subscribed = await characteristic.WriteClientCharacteristicConfigurationDescriptorAsync(mode);
                        if (generation != requestedGeneration) { characteristic.ValueChanged -= handler; return; }
                        if (subscribed == GattCommunicationStatus.Success)
                        {
                            notify.Add(characteristic.Uuid.ToString());
                            subscriptions.Add((characteristic, handler));
                        }
                        else characteristic.ValueChanged -= handler;
                    }
                    services.Add(new { uuid = service.Uuid.ToString(), notify, write });
                }
            }
            if (services.Count == 0) throw new InvalidOperationException("设备未提供受支持的 GAN 服务");
            if (generation == requestedGeneration) Emit("services", new { generation = requestedGeneration, services });
        }
        catch (Exception ex)
        {
            if (generation == requestedGeneration)
            {
                Error($"Windows 蓝牙连接失败（阶段：{stage}，HRESULT 0x{ex.HResult:X8}）：{ex.Message}", requestedGeneration);
                Disconnect();
            }
        }
    }

    private async Task WriteAsync(string uuid, string base64)
    {
        if (!writable.TryGetValue(uuid, out var characteristic)) { Error("未找到蓝牙写入特征", generation); return; }
        try
        {
            var writer = new DataWriter();
            writer.WriteBytes(Convert.FromBase64String(base64));
            var option = (characteristic.CharacteristicProperties & GattCharacteristicProperties.Write) != 0
                ? GattWriteOption.WriteWithResponse : GattWriteOption.WriteWithoutResponse;
            var result = await characteristic.WriteValueAsync(writer.DetachBuffer(), option);
            if (result != GattCommunicationStatus.Success) Error($"蓝牙写入失败: {result}", generation);
        }
        catch (Exception ex) { Error($"蓝牙写入失败: {ex.Message}", generation); }
    }

    public async Task RunAsync()
    {
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                if (line.Length > 4096) throw new InvalidOperationException("命令过长");
                using var json = JsonDocument.Parse(line);
                var root = json.RootElement;
                var type = root.GetProperty("type").GetString();
                switch (type)
                {
                    case "scan":
                        StopScan();
                        lock (gate) { candidates.Clear(); pending.Clear(); }
                        watcher.Start();
                        break;
                    case "stopScan": StopScan(); break;
                    case "connect":
                        var address = root.GetProperty("address").GetString() ?? "";
                        var nextGeneration = root.GetProperty("generation").GetInt32();
                        _ = ConnectAsync(address, nextGeneration);
                        break;
                    case "disconnect":
                        generation++;
                        Disconnect();
                        break;
                    case "write":
                        _ = WriteAsync(root.GetProperty("charUuid").GetString() ?? "",
                            root.GetProperty("base64").GetString() ?? "");
                        break;
                }
            }
            catch (Exception ex) { Error($"蓝牙命令失败: {ex.Message}", generation); }
        }
        StopScan();
        Disconnect();
        await Task.CompletedTask;
    }
}
