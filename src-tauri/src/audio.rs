//! Audio device discovery and default-device switching for playback and capture.
//!
//! Discovery uses the public Core Audio API. Switching uses the undocumented
//! IPolicyConfig interface (the same path the Windows Sound settings use);
//! every failure is reported instead of silently pretending it switched.

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioDirection {
    Output,
    Input,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub direction: AudioDirection,
}

/// Playback and capture endpoints in enumeration order, each marked against
/// the default endpoint for its own direction.
pub fn list() -> Result<Vec<AudioDevice>, String> {
    imp::list()
}

pub fn default_device() -> Option<AudioDevice> {
    imp::default_device(AudioDirection::Output)
}

pub fn default_input_device() -> Option<AudioDevice> {
    imp::default_device(AudioDirection::Input)
}

/// Switches the default endpoint for every role. Works for both playback and
/// capture endpoint ids.
pub fn set_default(device_id: &str) -> Result<(), String> {
    imp::set_default(device_id)
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
mod imp {
    use super::{AudioDevice, AudioDirection};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::Media::Audio::{
        DEVICE_STATE_ACTIVE, EDataFlow, ERole, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        eCapture, eCommunications, eConsole, eMultimedia, eRender,
    };
    use windows::Win32::System::Com::StructuredStorage::{
        PROPVARIANT, PropVariantClear, PropVariantToStringAlloc,
    };
    use windows::Win32::System::Com::{
        CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
        CoUninitialize, STGM_READ,
    };
    use windows::core::{BOOL, GUID, HRESULT, PCWSTR, PWSTR, interface};

    /// Undocumented, but stable since Windows 7; the Sound settings use it.
    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    unsafe trait IPolicyConfig: windows::core::IUnknown {
        fn GetMixFormat(&self, device_id: PCWSTR, format: *mut *mut core::ffi::c_void) -> HRESULT;
        fn GetDeviceFormat(
            &self,
            device_id: PCWSTR,
            default: BOOL,
            format: *mut *mut core::ffi::c_void,
        ) -> HRESULT;
        fn ResetDeviceFormat(&self, device_id: PCWSTR) -> HRESULT;
        fn SetDeviceFormat(
            &self,
            device_id: PCWSTR,
            endpoint: *const core::ffi::c_void,
            mix: *const core::ffi::c_void,
        ) -> HRESULT;
        fn GetProcessingPeriod(
            &self,
            device_id: PCWSTR,
            default: BOOL,
            default_period: *mut i64,
            minimum_period: *mut i64,
        ) -> HRESULT;
        fn SetProcessingPeriod(&self, device_id: PCWSTR, period: *const i64) -> HRESULT;
        fn GetShareMode(&self, device_id: PCWSTR, mode: *mut *mut core::ffi::c_void) -> HRESULT;
        fn SetShareMode(&self, device_id: PCWSTR, mode: *const core::ffi::c_void) -> HRESULT;
        fn GetPropertyValue(
            &self,
            device_id: PCWSTR,
            key: *const PROPERTYKEY,
            value: *mut *mut core::ffi::c_void,
        ) -> HRESULT;
        fn SetPropertyValue(
            &self,
            device_id: PCWSTR,
            key: *const PROPERTYKEY,
            value: *const core::ffi::c_void,
        ) -> HRESULT;
        fn SetDefaultEndpoint(&self, device_id: PCWSTR, role: ERole) -> HRESULT;
        fn SetEndpointVisibility(&self, device_id: PCWSTR, visible: BOOL) -> HRESULT;
    }

    const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    fn with_com<T>(run: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        unsafe {
            let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let result = run();
            if initialized {
                CoUninitialize();
            }
            result
        }
    }

    fn enumerator() -> Result<IMMDeviceEnumerator, String> {
        unsafe {
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|error| format!("无法访问音频设备: {error}"))
        }
    }

    fn endpoint_id(device: &IMMDevice) -> Result<String, String> {
        unsafe {
            let raw = device.GetId().map_err(|error| error.to_string())?;
            let id = raw.to_string().map_err(|error| error.to_string());
            CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
            id
        }
    }

    fn friendly_name(device: &IMMDevice) -> Option<String> {
        unsafe {
            let store = device.OpenPropertyStore(STGM_READ).ok()?;
            let mut value: PROPVARIANT = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
            let raw: PWSTR = PropVariantToStringAlloc(&value).ok()?;
            let name = raw.to_string().ok();
            CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
            let _ = PropVariantClear(&mut value);
            name.filter(|text| !text.is_empty())
        }
    }

    fn describe(device: &IMMDevice, direction: AudioDirection) -> Result<AudioDevice, String> {
        let id = endpoint_id(device)?;
        let name = friendly_name(device).unwrap_or_else(|| "未命名设备".to_string());
        Ok(AudioDevice {
            id,
            name,
            is_default: false,
            direction,
        })
    }

    fn flow_enum(flow: EDataFlow) -> (AudioDirection, &'static str) {
        if flow == eCapture {
            (AudioDirection::Input, "输入设备")
        } else {
            (AudioDirection::Output, "输出设备")
        }
    }

    fn flow_devices(
        enumerator: &IMMDeviceEnumerator,
        flow: EDataFlow,
    ) -> Result<Vec<AudioDevice>, String> {
        let (direction, label) = flow_enum(flow);
        unsafe {
            let default_id = enumerator
                .GetDefaultAudioEndpoint(flow, eConsole)
                .ok()
                .and_then(|device| endpoint_id(&device).ok());
            let collection = enumerator
                .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
                .map_err(|error| format!("无法读取{label}: {error}"))?;
            let count = collection.GetCount().map_err(|error| error.to_string())?;
            let mut devices = Vec::new();
            for index in 0..count {
                let device = collection.Item(index).map_err(|error| error.to_string())?;
                let mut info = describe(&device, direction)?;
                info.is_default = default_id.as_deref() == Some(info.id.as_str());
                devices.push(info);
            }
            Ok(devices)
        }
    }

    pub fn list() -> Result<Vec<AudioDevice>, String> {
        with_com(|| {
            let enumerator = enumerator()?;
            let mut devices = flow_devices(&enumerator, eRender)?;
            devices.extend(flow_devices(&enumerator, eCapture)?);
            Ok(devices)
        })
    }

    pub fn default_device(direction: AudioDirection) -> Option<AudioDevice> {
        with_com(|| {
            let enumerator = enumerator()?;
            let flow = if direction == AudioDirection::Input {
                eCapture
            } else {
                eRender
            };
            unsafe {
                let device = enumerator
                    .GetDefaultAudioEndpoint(flow, eConsole)
                    .map_err(|error| error.to_string())?;
                let mut info = describe(&device, direction)?;
                info.is_default = true;
                Ok(info)
            }
        })
        .ok()
    }

    pub fn set_default(device_id: &str) -> Result<(), String> {
        let wide: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        with_com(|| unsafe {
            let policy: IPolicyConfig = CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)
                .map_err(|error| format!("无法切换音频设备: {error}"))?;
            for role in [eConsole, eMultimedia, eCommunications] {
                policy
                    .SetDefaultEndpoint(PCWSTR(wide.as_ptr()), role)
                    .ok()
                    .map_err(|error| format!("切换音频设备失败: {error}"))?;
            }
            Ok(())
        })
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::{AudioDevice, AudioDirection};

    pub fn list() -> Result<Vec<AudioDevice>, String> {
        Err("音频设备切换仅支持 Windows".into())
    }

    pub fn default_device(_direction: AudioDirection) -> Option<AudioDevice> {
        None
    }

    pub fn set_default(_device_id: &str) -> Result<(), String> {
        Err("音频设备切换仅支持 Windows".into())
    }
}
