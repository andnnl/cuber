using System.Text.Json;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Storage.Streams;

// Emit only device name + GAN salt MAC. Windows' BluetoothAddress can be random;
// GAN manufacturer data embeds the stable encryption address when present.
using var done = new ManualResetEventSlim(false);
var watcher = new BluetoothLEAdvertisementWatcher { ScanningMode = BluetoothLEScanningMode.Active };
watcher.Received += (_, args) =>
{
    try
    {
        var name = args.Advertisement.LocalName;
        if (string.IsNullOrEmpty(name)) return;
        string? mac = null;
        var fromManufacturer = false;
        foreach (var data in args.Advertisement.ManufacturerData)
        {
            if ((data.CompanyId & 0xFF) != 1 || data.Data.Length < 9) continue;
            var bytes = new byte[data.Data.Length];
            DataReader.FromBuffer(data.Data).ReadBytes(bytes);
            mac = string.Join(":", bytes.Take(9).Skip(3).Reverse().Select(b => b.ToString("X2")));
            fromManufacturer = true;
            break;
        }
        mac ??= string.Join(":", Enumerable.Range(0, 6)
            .Select(i => ((args.BluetoothAddress >> ((5 - i) * 8)) & 0xFF).ToString("X2")));
        Console.WriteLine(JsonSerializer.Serialize(new { name, mac, address = args.BluetoothAddress.ToString("X12"),
            source = fromManufacturer ? "manufacturer" : "radio" }));
    }
    catch { /* Adapter / malformed advertisement: keep scanning. */ }
};
Console.CancelKeyPress += (_, args) => { args.Cancel = true; done.Set(); };
try
{
    watcher.Start();
    done.Wait(TimeSpan.FromSeconds(15));
}
finally { watcher.Stop(); }
