use serde::Serialize;
use std::time::Duration;
use tauri::Emitter;

#[derive(Clone, PartialEq, Serialize)]
pub struct BluetoothStatus {
    id: String,
    name: String,
    battery: Option<u8>,
}

#[derive(Clone, PartialEq, Serialize)]
pub struct DeviceStatus {
    brightness: Option<u8>,
    bluetooth: Option<Vec<BluetoothStatus>>,
}

#[tauri::command]
pub async fn get_device_status() -> Result<DeviceStatus, String> {
    tauri::async_runtime::spawn_blocking(read_devices)
        .await
        .map_err(|e| e.to_string())
}

/// Bluetooth addresses arrive as `AA:BB:CC:DD:EE:FF` in varying case; device
/// ids embed the same digits as 12 contiguous uppercase hex characters.
#[cfg(target_os = "windows")]
fn normalized_mac(address: &str) -> Option<String> {
    let mac: String = address
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .collect::<String>()
        .to_ascii_uppercase();
    (mac.len() == 12).then_some(mac)
}

/// Hands-Free profile nodes carry the 0000111E service UUID and the peer
/// address in their device id; `id` must already be uppercased.
#[cfg(target_os = "windows")]
fn is_handsfree_node(id: &str, mac: &str) -> bool {
    id.contains("0000111E") && id.contains(mac)
}

/// Reads GetSystemPowerStatus fields. Bit 7 of the battery flag means "no
/// battery", 255 means unknown; the AC line only knows 0 (battery) and
/// 1 (AC), anything else is reported as absent.
#[cfg(target_os = "windows")]
fn power_status(
    ac_line: u8,
    battery_flag: u8,
    battery_percent: u8,
) -> (Option<bool>, Option<u8>, Option<bool>) {
    (
        (ac_line <= 1).then_some(ac_line == 1),
        (battery_percent <= 100 && battery_flag & 128 == 0).then_some(battery_percent),
        (battery_flag != 255 && battery_flag & 128 == 0).then_some(battery_flag & 8 != 0),
    )
}

/// Classic headsets report their battery on the Hands-Free profile node;
/// `System.Devices.BatteryLife` is not populated for them.
#[cfg(target_os = "windows")]
fn bluetooth_hfp_battery(address: &str) -> Option<u8> {
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        CM_GETIDLIST_FILTER_ENUMERATOR, CM_Get_DevNode_PropertyW, CM_Get_Device_ID_List_SizeW,
        CM_Get_Device_ID_ListW, CM_LOCATE_DEVNODE_NORMAL, CM_Locate_DevNodeW, CR_SUCCESS,
    };
    use windows::Win32::Devices::Properties::DEVPROPTYPE;
    use windows::Win32::Foundation::DEVPROPKEY;
    use windows::core::{GUID, PCWSTR};

    const BLUETOOTH_BATTERY: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
        pid: 2,
    };
    let mac = normalized_mac(address)?;
    unsafe {
        let filter: Vec<u16> = "BTHENUM".encode_utf16().chain(std::iter::once(0)).collect();
        let mut length = 0u32;
        if CM_Get_Device_ID_List_SizeW(
            &mut length,
            PCWSTR(filter.as_ptr()),
            CM_GETIDLIST_FILTER_ENUMERATOR,
        ) != CR_SUCCESS
        {
            return None;
        }
        let mut list = vec![0u16; length as usize];
        if CM_Get_Device_ID_ListW(
            PCWSTR(filter.as_ptr()),
            &mut list,
            CM_GETIDLIST_FILTER_ENUMERATOR,
        ) != CR_SUCCESS
        {
            return None;
        }
        for id in list.split(|value| *value == 0) {
            let text = String::from_utf16_lossy(id).to_ascii_uppercase();
            if !is_handsfree_node(&text, &mac) {
                continue;
            }
            let mut devinst = 0u32;
            if CM_Locate_DevNodeW(&mut devinst, PCWSTR(id.as_ptr()), CM_LOCATE_DEVNODE_NORMAL)
                != CR_SUCCESS
            {
                continue;
            }
            let mut property_type = DEVPROPTYPE(0);
            let mut value = [0u8; 8];
            let mut value_size = value.len() as u32;
            if CM_Get_DevNode_PropertyW(
                devinst,
                &BLUETOOTH_BATTERY,
                &mut property_type,
                Some(value.as_mut_ptr()),
                &mut value_size,
                0,
            ) != CR_SUCCESS
            {
                continue;
            }
            let written = (value_size as usize).min(value.len());
            if let Some(percent) = decode_battery_percent(property_type, &value[..written]) {
                return Some(percent);
            }
        }
    }
    None
}

/// Decodes the Bluetooth battery property, which vendors report either as a
/// byte or a 32-bit little-endian integer; values above 100 are not a
/// percentage and are rejected. A UINT32 wider than a byte is truncated
/// exactly as before this was extracted.
#[cfg(target_os = "windows")]
fn decode_battery_percent(
    property_type: windows::Win32::Devices::Properties::DEVPROPTYPE,
    value: &[u8],
) -> Option<u8> {
    use windows::Win32::Devices::Properties::{DEVPROP_TYPE_BYTE, DEVPROP_TYPE_UINT32};
    let percent = if property_type == DEVPROP_TYPE_BYTE && !value.is_empty() {
        value[0]
    } else if property_type == DEVPROP_TYPE_UINT32 && value.len() >= 4 {
        u32::from_le_bytes([value[0], value[1], value[2], value[3]]) as u8
    } else {
        return None;
    };
    (percent <= 100).then_some(percent)
}

fn read_devices() -> DeviceStatus {
    #[cfg(target_os = "windows")]
    {
        use std::future::IntoFuture;
        use windows::Devices::Bluetooth::{
            BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice,
        };
        use windows::Devices::Enumeration::DeviceInformation;
        use windows::Foundation::IPropertyValue;
        use windows::core::{HSTRING, Interface};
        use windows_collections::IIterable;
        #[derive(serde::Deserialize)]
        struct Brightness {
            #[serde(rename = "CurrentBrightness")]
            value: u8,
        }
        let brightness = wmi::WMIConnection::with_namespace_path("ROOT\\WMI")
            .ok()
            .and_then(|connection| {
                connection
                    .raw_query::<Brightness>(
                        "SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active = TRUE",
                    )
                    .ok()
            })
            .and_then(|values| values.first().map(|value| value.value));
        let bluetooth = (|| {
            let selectors = [
                BluetoothDevice::GetDeviceSelectorFromConnectionStatus(
                    BluetoothConnectionStatus::Connected,
                )
                .ok()?,
                BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(
                    BluetoothConnectionStatus::Connected,
                )
                .ok()?,
            ];
            let mut devices = Vec::new();
            for selector in selectors {
                let requested: IIterable<HSTRING> = vec![
                    HSTRING::from("System.Devices.BatteryLife"),
                    HSTRING::from("System.Devices.Aep.DeviceAddress"),
                ]
                .into();
                let collection = futures::executor::block_on(
                    DeviceInformation::FindAllAsyncAqsFilterAndAdditionalProperties(
                        &selector, &requested,
                    )
                    .ok()?
                    .into_future(),
                )
                .ok()?;
                for index in 0..collection.Size().ok()? {
                    let device = collection.GetAt(index).ok()?;
                    let name = device.Name().ok()?.to_string();
                    if !name.is_empty() && !devices.iter().any(|d: &BluetoothStatus| d.name == name)
                    {
                        let store = device.Properties().ok();
                        let address = store
                            .as_ref()
                            .and_then(|props| {
                                props
                                    .Lookup(&HSTRING::from("System.Devices.Aep.DeviceAddress"))
                                    .ok()
                            })
                            .and_then(|value| value.cast::<IPropertyValue>().ok())
                            .and_then(|value| value.GetString().ok())
                            .map(|value| value.to_string());
                        let battery = store
                            .as_ref()
                            .and_then(|props| {
                                props
                                    .Lookup(&HSTRING::from("System.Devices.BatteryLife"))
                                    .ok()
                            })
                            .and_then(|value| value.cast::<IPropertyValue>().ok())
                            .and_then(|value| {
                                value.GetUInt8().ok().or_else(|| {
                                    value
                                        .GetUInt32()
                                        .ok()
                                        .and_then(|value| u8::try_from(value).ok())
                                })
                            })
                            .filter(|value| *value <= 100)
                            // Classic headsets report their battery on the
                            // Hands-Free node instead of BatteryLife.
                            .or_else(|| address.as_deref().and_then(bluetooth_hfp_battery));
                        devices.push(BluetoothStatus {
                            id: device.Id().ok()?.to_string(),
                            name,
                            battery,
                        });
                    }
                }
            }
            Some(devices)
        })();
        DeviceStatus {
            brightness,
            bluetooth,
        }
    }
    #[cfg(not(target_os = "windows"))]
    DeviceStatus {
        brightness: None,
        bluetooth: None,
    }
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    volume: Option<u8>,
    muted: Option<bool>,
    on_ac: Option<bool>,
    battery: Option<u8>,
    charging: Option<bool>,
    output_device: Option<crate::audio::AudioDevice>,
    input_device: Option<crate::audio::AudioDevice>,
}

#[tauri::command]
pub async fn get_system_status() -> Result<SystemStatus, String> {
    tauri::async_runtime::spawn_blocking(read_status)
        .await
        .map_err(|e| e.to_string())
}

/// How often the background sampler reads the cheap status snapshot
/// (volume, power, default devices).
const STATUS_SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
/// Device snapshots (WMI brightness, Bluetooth enumeration) cost more to
/// read; sample them every third round.
const DEVICE_SAMPLE_EVERY: u64 = 3;

/// Compares each sampled round against the previous one. The very first
/// round is the baseline: nothing is emitted, so an app start never replays
/// the current state as if it were a change.
#[derive(Default)]
struct StatusSampler {
    last_status: Option<SystemStatus>,
    last_devices: Option<DeviceStatus>,
}

impl StatusSampler {
    /// Feeds one round and returns the snapshots worth broadcasting. Device
    /// rounds without a fresh sample (`None`) keep the previous baseline.
    fn observe(
        &mut self,
        status: SystemStatus,
        devices: Option<DeviceStatus>,
    ) -> (Option<SystemStatus>, Option<DeviceStatus>) {
        let mut emit_status = None;
        if self.last_status.is_some() && self.last_status.as_ref() != Some(&status) {
            emit_status = Some(status.clone());
        }
        self.last_status = Some(status);
        let mut emit_devices = None;
        if let Some(devices) = devices {
            if self.last_devices.is_some() && self.last_devices.as_ref() != Some(&devices) {
                emit_devices = Some(devices.clone());
            }
            self.last_devices = Some(devices);
        }
        (emit_status, emit_devices)
    }
}

/// Background sampler: reads system and device snapshots off the window
/// thread and pushes only what changed as `system-status-changed` /
/// `device-status-changed` events, so the frontends do not have to poll the
/// status commands every second.
pub fn spawn_status_sampler<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    let _ = std::thread::Builder::new()
        .name("status-sampler".into())
        .spawn(move || {
            let mut sampler = StatusSampler::default();
            let mut round: u64 = 0;
            loop {
                let devices = round.is_multiple_of(DEVICE_SAMPLE_EVERY).then(read_devices);
                let (status, devices) = sampler.observe(read_status(), devices);
                if let Some(status) = status {
                    let _ = app.emit("system-status-changed", status);
                }
                if let Some(devices) = devices {
                    let _ = app.emit("device-status-changed", devices);
                }
                round = round.wrapping_add(1);
                std::thread::sleep(STATUS_SAMPLE_INTERVAL);
            }
        });
}

#[cfg(test)]
mod sampler_tests {
    use super::{BluetoothStatus, DeviceStatus, StatusSampler, SystemStatus};

    fn status(volume: Option<u8>) -> SystemStatus {
        SystemStatus {
            volume,
            muted: Some(false),
            on_ac: Some(true),
            battery: Some(80),
            charging: Some(false),
            output_device: None,
            input_device: None,
        }
    }

    fn devices(count: usize) -> DeviceStatus {
        DeviceStatus {
            brightness: Some(70),
            bluetooth: Some(
                (0..count)
                    .map(|index| BluetoothStatus {
                        id: format!("device-{index}"),
                        name: format!("耳机{index}"),
                        battery: Some(60),
                    })
                    .collect(),
            ),
        }
    }

    #[test]
    fn first_round_is_the_baseline() {
        let mut sampler = StatusSampler::default();
        let (emit_status, emit_devices) = sampler.observe(status(Some(30)), Some(devices(1)));
        assert!(emit_status.is_none() && emit_devices.is_none());
    }

    #[test]
    fn only_changes_are_emitted() {
        let mut sampler = StatusSampler::default();
        let _ = sampler.observe(status(Some(30)), Some(devices(1)));
        let (emit_status, emit_devices) = sampler.observe(status(Some(30)), Some(devices(1)));
        assert!(emit_status.is_none() && emit_devices.is_none());
        let (emit_status, emit_devices) = sampler.observe(status(Some(45)), Some(devices(2)));
        assert_eq!(emit_status.map(|s| s.volume), Some(Some(45)));
        assert_eq!(
            emit_devices.map(|d| d.bluetooth.map(|b| b.len())),
            Some(Some(2))
        );
    }

    #[test]
    fn rounds_without_a_device_sample_keep_the_baseline() {
        let mut sampler = StatusSampler::default();
        let _ = sampler.observe(status(None), Some(devices(1)));
        let (emit_status, emit_devices) = sampler.observe(status(None), None);
        assert!(emit_status.is_none() && emit_devices.is_none());
        // An unchanged device snapshot is not re-emitted either.
        let (emit_status, emit_devices) = sampler.observe(status(None), Some(devices(1)));
        assert!(emit_status.is_none() && emit_devices.is_none());
    }
}

fn read_status() -> SystemStatus {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::Media::Audio::{
            IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eRender,
        };
        use windows::Win32::System::Com::{
            CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
        };
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        unsafe {
            let mut status = SYSTEM_POWER_STATUS::default();
            let power_ok = GetSystemPowerStatus(&mut status).is_ok();
            let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let audio = (|| {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
                let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
                let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
                Some((
                    (endpoint.GetMasterVolumeLevelScalar().ok()? * 100.0).round() as u8,
                    endpoint.GetMute().ok()?.as_bool(),
                ))
            })();
            if initialized {
                CoUninitialize();
            }
            let (on_ac, battery, charging) = if power_ok {
                power_status(
                    status.ACLineStatus,
                    status.BatteryFlag,
                    status.BatteryLifePercent,
                )
            } else {
                (None, None, None)
            };
            SystemStatus {
                volume: audio.map(|v| v.0),
                muted: audio.map(|v| v.1),
                on_ac,
                battery,
                charging,
                output_device: crate::audio::default_device(),
                input_device: crate::audio::default_input_device(),
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    SystemStatus {
        volume: None,
        muted: None,
        on_ac: None,
        battery: None,
        charging: None,
        output_device: None,
        input_device: None,
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{decode_battery_percent, is_handsfree_node, normalized_mac, power_status};
    use windows::Win32::Devices::Properties::{
        DEVPROP_TYPE_BYTE, DEVPROP_TYPE_UINT32, DEVPROPTYPE,
    };

    #[test]
    fn reads_power_flags_and_rejects_unknown_states() {
        // On AC and charging at 80%.
        assert_eq!(power_status(1, 8, 80), (Some(true), Some(80), Some(true)));
        // On battery, discharging.
        assert_eq!(power_status(0, 1, 45), (Some(false), Some(45), Some(false)));
        // No battery: percentage and charging are unknown.
        assert_eq!(power_status(1, 128, 0), (Some(true), None, None));
        // Unknown battery state (255).
        assert_eq!(power_status(1, 255, 100), (Some(true), None, None));
        // AC line outside 0/1 cannot be interpreted.
        assert_eq!(power_status(2, 0, 50), (None, Some(50), Some(false)));
        // A percentage above 100 is not reported.
        assert_eq!(power_status(1, 0, 101), (Some(true), None, Some(false)));
    }

    #[test]
    fn normalizes_addresses_to_twelve_uppercase_hex_digits() {
        assert_eq!(
            normalized_mac("AA:BB:CC:DD:EE:FF").as_deref(),
            Some("AABBCCDDEEFF")
        );
        assert_eq!(
            normalized_mac("aabbccddeeff").as_deref(),
            Some("AABBCCDDEEFF")
        );
        assert_eq!(normalized_mac("(((())))"), None);
        assert_eq!(normalized_mac("AABBCCDDEEFF0"), None);
    }

    #[test]
    fn matches_only_handsfree_nodes_with_the_peer_address() {
        let node = "BTHENUM\\{0000111E-0000-1000-8000-00805F9B34FB}_VID&0001000C\\8&AABBCCDDEEFF";
        assert!(is_handsfree_node(node, "AABBCCDDEEFF"));
        assert!(!is_handsfree_node(
            "BTHENUM\\{0000110B-0000-1000-8000-00805F9B34FB}\\8&AABBCCDDEEFF",
            "AABBCCDDEEFF"
        ));
        assert!(!is_handsfree_node(
            "BTHENUM\\{0000111E-0000-1000-8000-00805F9B34FB}\\8&000000000000",
            "AABBCCDDEEFF"
        ));
    }

    #[test]
    fn decodes_battery_properties_of_both_kinds() {
        assert_eq!(decode_battery_percent(DEVPROP_TYPE_BYTE, &[80]), Some(80));
        assert_eq!(
            decode_battery_percent(DEVPROP_TYPE_UINT32, &[64, 0, 0, 0]),
            Some(64)
        );
        // Not a percentage.
        assert_eq!(
            decode_battery_percent(DEVPROP_TYPE_UINT32, &[101, 0, 0, 0]),
            None
        );
        // Unknown property type or truncated value.
        assert_eq!(decode_battery_percent(DEVPROPTYPE(0), &[80]), None);
        assert_eq!(decode_battery_percent(DEVPROP_TYPE_UINT32, &[64, 0]), None);
        assert_eq!(decode_battery_percent(DEVPROP_TYPE_BYTE, &[]), None);
    }
}
