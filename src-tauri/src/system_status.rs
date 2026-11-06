use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct BluetoothStatus {
    id: String,
    name: String,
    battery: Option<u8>,
}

#[derive(Serialize)]
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

/// Classic headsets report their battery on the Hands-Free profile node;
/// `System.Devices.BatteryLife` is not populated for them.
#[cfg(target_os = "windows")]
fn bluetooth_hfp_battery(address: &str) -> Option<u8> {
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        CM_GETIDLIST_FILTER_ENUMERATOR, CM_Get_DevNode_PropertyW, CM_Get_Device_ID_List_SizeW,
        CM_Get_Device_ID_ListW, CM_LOCATE_DEVNODE_NORMAL, CM_Locate_DevNodeW, CR_SUCCESS,
    };
    use windows::Win32::Devices::Properties::{
        DEVPROP_TYPE_BYTE, DEVPROP_TYPE_UINT32, DEVPROPTYPE,
    };
    use windows::Win32::Foundation::DEVPROPKEY;
    use windows::core::{GUID, PCWSTR};

    const BLUETOOTH_BATTERY: DEVPROPKEY = DEVPROPKEY {
        fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
        pid: 2,
    };
    let mac: String = address
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .collect::<String>()
        .to_ascii_uppercase();
    if mac.len() != 12 {
        return None;
    }
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
            // Hands-Free profile node: {0000111E-...} and the remote address.
            if !text.contains("0000111E") || !text.contains(&mac) {
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
            let percent = if property_type == DEVPROP_TYPE_BYTE && value_size >= 1 {
                Some(value[0])
            } else if property_type == DEVPROP_TYPE_UINT32 && value_size >= 4 {
                Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]) as u8)
            } else {
                None
            };
            if let Some(percent) = percent.filter(|percent| *percent <= 100) {
                return Some(percent);
            }
        }
    }
    None
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

#[derive(Serialize)]
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
            SystemStatus {
                volume: audio.map(|v| v.0),
                muted: audio.map(|v| v.1),
                on_ac: if power_ok && status.ACLineStatus <= 1 {
                    Some(status.ACLineStatus == 1)
                } else {
                    None
                },
                battery: if power_ok
                    && status.BatteryLifePercent <= 100
                    && status.BatteryFlag & 128 == 0
                {
                    Some(status.BatteryLifePercent)
                } else {
                    None
                },
                charging: if power_ok && status.BatteryFlag != 255 && status.BatteryFlag & 128 == 0
                {
                    Some(status.BatteryFlag & 8 != 0)
                } else {
                    None
                },
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
