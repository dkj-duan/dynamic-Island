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
                let properties: IIterable<HSTRING> =
                    vec![HSTRING::from("System.Devices.BatteryLife")].into();
                let collection = futures::executor::block_on(
                    DeviceInformation::FindAllAsyncAqsFilterAndAdditionalProperties(
                        &selector,
                        &properties,
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
                        let battery = device
                            .Properties()
                            .ok()
                            .and_then(|p| {
                                p.Lookup(&HSTRING::from("System.Devices.BatteryLife")).ok()
                            })
                            .and_then(|v| v.cast::<IPropertyValue>().ok())
                            .and_then(|v| {
                                v.GetUInt8().ok().or_else(|| {
                                    v.GetUInt32()
                                        .ok()
                                        .and_then(|value| u8::try_from(value).ok())
                                })
                            })
                            .filter(|value| *value <= 100);
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
    }
}
