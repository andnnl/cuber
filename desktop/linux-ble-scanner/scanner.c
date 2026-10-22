#include <gio/gio.h>
#include <glib-unix.h>
#include <stdio.h>
#include <string.h>

static GDBusObjectManager *manager;
static GMainLoop *loop;
static GPtrArray *started_adapters;

static gchar *format_mac(const guint8 *bytes) {
  return g_strdup_printf("%02X:%02X:%02X:%02X:%02X:%02X",
    bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
}

static gchar *normalized_address(const gchar *address) {
  guint8 bytes[6];
  gchar compact[13];
  guint length = 0;
  if (!address) return NULL;
  for (const gchar *p = address; *p; p++) {
    if (*p == ':' || *p == '-') continue;
    if (!g_ascii_isxdigit(*p) || length >= 12) return NULL;
    compact[length++] = *p;
  }
  if (length != 12) return NULL;
  compact[12] = '\0';
  for (guint i = 0; i < 6; i++) {
    gchar pair[] = { compact[i * 2], compact[i * 2 + 1], '\0' };
    bytes[i] = (guint8) strtoul(pair, NULL, 16);
  }
  return format_mac(bytes);
}

static gchar *manufacturer_mac(GVariant *manufacturer) {
  if (!manufacturer || !g_variant_is_of_type(manufacturer, G_VARIANT_TYPE("a{qv}"))) return NULL;
  GVariantIter iter;
  guint16 company;
  GVariant *value;
  g_variant_iter_init(&iter, manufacturer);
  while (g_variant_iter_next(&iter, "{qv}", &company, &value)) {
    GVariant *bytes = value;
    if (g_variant_is_of_type(bytes, G_VARIANT_TYPE_VARIANT)) bytes = g_variant_get_variant(value);
    if ((company & 0xff) == 1 && g_variant_is_of_type(bytes, G_VARIANT_TYPE("ay"))) {
      gsize length = 0;
      const guint8 *raw = g_variant_get_fixed_array(bytes, &length, sizeof(guint8));
      if (raw && length >= 9) {
        guint8 mac[] = { raw[8], raw[7], raw[6], raw[5], raw[4], raw[3] };
        gchar *result = format_mac(mac);
        if (bytes != value) g_variant_unref(bytes);
        g_variant_unref(value);
        return result;
      }
    }
    if (bytes != value) g_variant_unref(bytes);
    g_variant_unref(value);
  }
  return NULL;
}

static gchar *preferred_mac(GVariant *manufacturer, const gchar *address, gboolean *from_manufacturer) {
  gchar *mac = manufacturer_mac(manufacturer);
  if (from_manufacturer) *from_manufacturer = mac != NULL;
  return mac ? mac : normalized_address(address);
}

static gchar *json_string(const gchar *input) {
  GString *output = g_string_new("\"");
  for (const guchar *p = (const guchar *) input; *p; p++) {
    if (*p == '"' || *p == '\\') g_string_append_c(output, '\\');
    if (*p < 0x20) g_string_append_printf(output, "\\u%04x", *p);
    else g_string_append_c(output, *p);
  }
  g_string_append_c(output, '"');
  return g_string_free(output, FALSE);
}

static gboolean valid_name(const gchar *name) {
  return name && name[0] && g_utf8_validate(name, -1, NULL);
}

static gboolean should_report_device(const gchar *name, gboolean live) {
  return live && valid_name(name) &&
    (g_str_has_prefix(name, "GAN") || g_str_has_prefix(name, "MG") || g_str_has_prefix(name, "AiCube"));
}

static gboolean is_advertisement_change(GVariant *changed) {
  const gchar *keys[] = { "RSSI", "ManufacturerData", "ServiceData", "TxPower", "AdvertisingFlags" };
  if (!changed) return FALSE;
  for (guint i = 0; i < G_N_ELEMENTS(keys); i++) {
    GVariant *value = g_variant_lookup_value(changed, keys[i], NULL);
    if (value) { g_variant_unref(value); return TRUE; }
  }
  return FALSE;
}

static void report_device(GDBusProxy *proxy) {
  GVariant *name_value = g_dbus_proxy_get_cached_property(proxy, "Name");
  if (!name_value) name_value = g_dbus_proxy_get_cached_property(proxy, "Alias");
  GVariant *address_value = g_dbus_proxy_get_cached_property(proxy, "Address");
  if (!name_value || !address_value || !g_variant_is_of_type(name_value, G_VARIANT_TYPE_STRING) ||
      !g_variant_is_of_type(address_value, G_VARIANT_TYPE_STRING)) goto done;
  const gchar *name = g_variant_get_string(name_value, NULL);
  if (!should_report_device(name, TRUE)) goto done;
  gchar *address = normalized_address(g_variant_get_string(address_value, NULL));
  if (!address) goto done;
  GVariant *data = g_dbus_proxy_get_cached_property(proxy, "ManufacturerData");
  gboolean from_manufacturer = FALSE;
  gchar *mac = preferred_mac(data, address, &from_manufacturer);
  gchar *escaped = json_string(name);
  g_print("{\"name\":%s,\"mac\":\"%s\",\"address\":\"%s\",\"source\":\"%s\"}\n",
    escaped, mac, address, from_manufacturer ? "manufacturer" : "radio");
  fflush(stdout);
  g_free(escaped);
  g_free(mac);
  if (data) g_variant_unref(data);
  g_free(address);
done:
  if (name_value) g_variant_unref(name_value);
  if (address_value) g_variant_unref(address_value);
}

static void object_added(GDBusObjectManager *unused, GDBusObject *object, gpointer data) {
  (void) unused; (void) data;
  GDBusInterface *device = g_dbus_object_get_interface(object, "org.bluez.Device1");
  if (device) {
    report_device(G_DBUS_PROXY(device));
    g_object_unref(device);
  }
}

static void properties_changed(GDBusObjectManagerClient *unused, GDBusObjectProxy *object,
  GDBusProxy *proxy, GVariant *changed, const gchar *const *invalidated, gpointer data) {
  (void) unused; (void) object; (void) invalidated; (void) data;
  if (g_str_equal(g_dbus_proxy_get_interface_name(proxy), "org.bluez.Device1") &&
      is_advertisement_change(changed)) report_device(proxy);
}

static gboolean finish_scan(gpointer data) { (void) data; g_main_loop_quit(loop); return G_SOURCE_REMOVE; }

static gboolean scan(void) {
  GError *error = NULL;
  manager = g_dbus_object_manager_client_new_for_bus_sync(G_BUS_TYPE_SYSTEM,
    G_DBUS_OBJECT_MANAGER_CLIENT_FLAGS_NONE, "org.bluez", "/", NULL, NULL, NULL, NULL, &error);
  if (!manager) {
    g_printerr("BlueZ unavailable: %s\n", error ? error->message : "unknown error");
    g_clear_error(&error);
    return FALSE;
  }
  started_adapters = g_ptr_array_new_with_free_func(g_object_unref);
  g_signal_connect(manager, "object-added", G_CALLBACK(object_added), NULL);
  g_signal_connect(manager, "interface-proxy-properties-changed", G_CALLBACK(properties_changed), NULL);
  GList *objects = g_dbus_object_manager_get_objects(manager);
  for (GList *entry = objects; entry; entry = entry->next) {
    GDBusInterface *adapter = g_dbus_object_get_interface(entry->data, "org.bluez.Adapter1");
    if (!adapter) continue;
    GDBusProxy *proxy = G_DBUS_PROXY(adapter);
    GVariant *reply = g_dbus_proxy_call_sync(proxy, "StartDiscovery", NULL,
      G_DBUS_CALL_FLAGS_NONE, 2000, NULL, &error);
    if (reply) { g_ptr_array_add(started_adapters, g_object_ref(proxy)); g_variant_unref(reply); }
    else { g_printerr("StartDiscovery: %s\n", error->message); g_clear_error(&error); }
    g_object_unref(adapter);
  }
  g_list_free_full(objects, g_object_unref);
  loop = g_main_loop_new(NULL, FALSE);
  g_timeout_add_seconds(15, finish_scan, NULL);
  g_unix_signal_add(SIGTERM, finish_scan, NULL);
  g_unix_signal_add(SIGINT, finish_scan, NULL);
  g_main_loop_run(loop);
  for (guint i = 0; i < started_adapters->len; i++) {
    GDBusProxy *proxy = g_ptr_array_index(started_adapters, i);
    GVariant *reply = g_dbus_proxy_call_sync(proxy, "StopDiscovery", NULL,
      G_DBUS_CALL_FLAGS_NONE, 2000, NULL, NULL);
    if (reply) g_variant_unref(reply);
  }
  g_ptr_array_unref(started_adapters);
  g_main_loop_unref(loop);
  g_object_unref(manager);
  return TRUE;
}

int main(int argc, char **argv) {
  if (argc == 2 && g_str_equal(argv[1], "--self-test")) {
    const guint8 bytes[] = { 1, 2, 3, 4, 5, 6, 7, 8, 9 };
    GVariant *payload = g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, bytes, 9, 1);
    GVariantBuilder builder;
    g_variant_builder_init(&builder, G_VARIANT_TYPE("a{qv}"));
    g_variant_builder_add(&builder, "{qv}", 0x0001, g_variant_new_variant(payload));
    GVariant *data = g_variant_ref_sink(g_variant_builder_end(&builder));
    gchar *mac = preferred_mac(data, "AA:BB:CC:DD:EE:FF", NULL);
    g_variant_unref(data);
    const guint8 short_bytes[] = { 1, 2 };
    g_variant_builder_init(&builder, G_VARIANT_TYPE("a{qv}"));
    g_variant_builder_add(&builder, "{qv}", 0x0001,
      g_variant_new_variant(g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, short_bytes, 2, 1)));
    data = g_variant_ref_sink(g_variant_builder_end(&builder));
    gchar *short_mac = preferred_mac(data, "AA:BB:CC:DD:EE:FF", NULL);
    g_variant_unref(data);
    g_variant_builder_init(&builder, G_VARIANT_TYPE("a{qv}"));
    g_variant_builder_add(&builder, "{qv}", 0x0002,
      g_variant_new_variant(g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, bytes, 9, 1)));
    data = g_variant_ref_sink(g_variant_builder_end(&builder));
    gchar *other_mac = preferred_mac(data, "AA:BB:CC:DD:EE:FF", NULL);
    g_variant_unref(data);
    GVariantBuilder changes;
    g_variant_builder_init(&changes, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&changes, "{sv}", "RSSI", g_variant_new_int16(-70));
    GVariant *live_changes = g_variant_ref_sink(g_variant_builder_end(&changes));
    g_variant_builder_init(&changes, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&changes, "{sv}", "Connected", g_variant_new_boolean(TRUE));
    GVariant *stale_changes = g_variant_ref_sink(g_variant_builder_end(&changes));
    g_print("{\"manufacturerMac\":\"%s\",\"shortDataMac\":\"%s\",\"otherVendorMac\":\"%s\",\"emptyNameIgnored\":%s,\"cachedDeviceIgnored\":%s,\"liveAdvertisementAccepted\":%s,\"unrelatedDeviceIgnored\":%s}\n",
      mac ? mac : "", short_mac ? short_mac : "", other_mac ? other_mac : "",
      !should_report_device("", TRUE) && !should_report_device(NULL, TRUE) ? "true" : "false",
      !should_report_device("GAN 12", FALSE) && !is_advertisement_change(stale_changes) ? "true" : "false",
      should_report_device("GAN 12", TRUE) && is_advertisement_change(live_changes) ? "true" : "false",
      !should_report_device("Other", TRUE) ? "true" : "false");
    g_variant_unref(live_changes); g_variant_unref(stale_changes);
    g_free(mac); g_free(short_mac); g_free(other_mac);
    return 0;
  }
  return scan() ? 0 : 1;
}
