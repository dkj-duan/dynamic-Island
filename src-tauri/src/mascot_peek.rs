use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WebviewWindowBuilder,
};

const PEEK_LABEL: &str = "peek";
const PEEK_HEIGHT: f64 = 30.0;
const TOP_WIDTH: f64 = 54.0;
const SIDE_WIDTH: f64 = 38.0;
const SIDE_OVERLAP: f64 = 6.0;

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Character {
    Classic,
    Golden,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Pose {
    Idle,
    Listening,
    Water,
    Celebrate,
    Attention,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
pub(crate) struct PeekAppearance {
    mascot: Character,
    pose: Pose,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Side {
    Left,
    Right,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
pub(crate) struct PeekView {
    #[serde(flatten)]
    appearance: PeekAppearance,
    side: Option<Side>,
}

#[derive(Debug, PartialEq)]
struct PeekGeometry {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    side: Option<Side>,
}

#[derive(Deserialize)]
enum Placement {
    #[serde(rename = "peek")]
    Left,
    #[serde(rename = "peek-center")]
    Center,
    #[serde(rename = "peek-right")]
    Right,
}

#[derive(Deserialize)]
pub(crate) struct PeekAnchor {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    placement: Placement,
}

static APPEARANCE: Mutex<Option<PeekView>> = Mutex::new(None);

#[tauri::command]
pub(crate) fn get_island_peek(window: WebviewWindow) -> Result<Option<PeekView>, String> {
    if window.label() != PEEK_LABEL {
        return Err("invalid companion window".into());
    }
    APPEARANCE
        .lock()
        .map(|state| *state)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_island_peek(
    window: WebviewWindow,
    appearance: Option<PeekAppearance>,
    anchor: Option<PeekAnchor>,
) -> Result<(), String> {
    if window.label() != "island" {
        return Err("invalid island window".into());
    }
    let app = window.app_handle();
    let peek = app.get_webview_window(PEEK_LABEL);
    let Some((appearance, anchor)) = appearance.zip(anchor) else {
        return peek.as_ref().map_or(Ok(()), hide);
    };
    if !anchor.x.is_finite()
        || !anchor.y.is_finite()
        || !anchor.width.is_finite()
        || anchor.width <= 0.0
        || !anchor.height.is_finite()
        || anchor.height <= 0.0
    {
        return Err("invalid companion anchor".into());
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())? * super::island_scale();
    let origin = window.outer_position().map_err(|e| e.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .map(|monitor| (*monitor.position(), *monitor.size()));
    let Some(PeekGeometry {
        position,
        size,
        side,
    }) = companion_geometry(&anchor, appearance.mascot, scale, origin, monitor)
    else {
        return peek.as_ref().map_or(Ok(()), hide);
    };
    let peek = match peek {
        Some(peek) => peek,
        None => {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|config| config.label == PEEK_LABEL)
                .ok_or("missing companion window configuration")?;
            // WebView2 creation must run outside the Windows event loop.
            WebviewWindowBuilder::from_config(app, config)
                .and_then(WebviewWindowBuilder::build)
                .map_err(|e| e.to_string())?
        }
    };
    if peek.inner_size().ok() != Some(size) {
        peek.set_size(size).map_err(|e| e.to_string())?;
    }
    if peek.outer_position().ok() != Some(position) {
        peek.set_position(position).map_err(|e| e.to_string())?;
    }
    update_appearance(&peek, Some(PeekView { appearance, side }))?;
    if !peek.is_visible().unwrap_or(false) {
        peek.set_ignore_cursor_events(true)
            .map_err(|e| e.to_string())?;
        peek.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn companion_geometry(
    anchor: &PeekAnchor,
    mascot: Character,
    scale: f64,
    origin: PhysicalPosition<i32>,
    monitor: Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>,
) -> Option<PeekGeometry> {
    let height = (PEEK_HEIGHT * scale).round() as u32;
    let top = origin.y + (anchor.y * scale).round() as i32;
    let y = top - height as i32;
    let mut x_bounds = None;
    if let Some((screen, bounds)) = monitor {
        let screen_right = screen.x + bounds.width as i32;
        if y < screen.y {
            let visible_top = top.max(screen.y);
            let visible_bottom = (origin.y + ((anchor.y + anchor.height) * scale).round() as i32)
                .min(screen.y + bounds.height as i32);
            let visible_height = visible_bottom - visible_top;
            let available_height = visible_height - 2 * scale.round() as i32;
            if available_height <= 0 {
                return None;
            }
            let left = origin.x + (anchor.x * scale).round() as i32;
            let right = origin.x + ((anchor.x + anchor.width) * scale).round() as i32;
            let (side_width, side_height, side_overlap) = match mascot {
                Character::Classic => (SIDE_WIDTH, PEEK_HEIGHT, SIDE_OVERLAP),
                Character::Golden => (38.0, 42.0, 7.0),
            };
            let width = (side_width * scale).round() as u32;
            let height = ((side_height * scale).round() as i32).min(available_height);
            let overlap = (side_overlap * scale).round() as i32;
            let outside = width as i32 - overlap;
            let left_room = left - screen.x;
            let right_room = screen_right - right;
            let prefer_left = match anchor.placement {
                Placement::Left => true,
                Placement::Right => false,
                Placement::Center => left_room >= right_room,
            };
            let side = match (left_room >= outside, right_room >= outside) {
                (true, true) if prefer_left => Side::Left,
                (_, true) => Side::Right,
                (true, false) => Side::Left,
                (false, false) => return None,
            };
            let x = match side {
                Side::Left => left - outside,
                Side::Right => right - overlap,
            };
            return Some(PeekGeometry {
                position: PhysicalPosition::new(x, visible_top + (visible_height - height) / 2),
                size: PhysicalSize::new(width, height as u32),
                side: Some(side),
            });
        }
        if top > screen.y + bounds.height as i32 {
            return None;
        }
        x_bounds = Some((screen.x, screen_right));
    }
    let width = (TOP_WIDTH * scale).round() as u32;
    let space = anchor.width - TOP_WIDTH;
    let inset = (space / 2.0).clamp(0.0, 22.0);
    let offset = match anchor.placement {
        Placement::Left if space >= 0.0 => inset,
        Placement::Center => space / 2.0,
        Placement::Right if space >= 0.0 => space - inset,
        _ => space / 2.0,
    };
    let mut x = origin.x + ((anchor.x + offset) * scale).round() as i32;
    if let Some((left, right)) = x_bounds {
        x = x.clamp(left, (right - width as i32).max(left));
    }
    Some(PeekGeometry {
        position: PhysicalPosition::new(x, y),
        size: PhysicalSize::new(width, height),
        side: None,
    })
}

fn hide(peek: &WebviewWindow) -> Result<(), String> {
    update_appearance(peek, None)?;
    peek.hide().map_err(|e| e.to_string())
}

fn update_appearance(peek: &WebviewWindow, next: Option<PeekView>) -> Result<(), String> {
    let changed = {
        let mut current = APPEARANCE.lock().map_err(|e| e.to_string())?;
        let changed = *current != next;
        *current = next;
        changed
    };
    if changed {
        peek.emit_to(PEEK_LABEL, "island-peek-changed", next)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn companion_uses_the_selected_alignment_above_or_beside_the_capsule() {
        let monitor = Some((PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)));
        let mut anchor = PeekAnchor {
            x: 20.0,
            y: 13.0,
            width: 200.0,
            height: 38.0,
            placement: Placement::Left,
        };
        for (placement, top_x, side_x, side) in [
            (Placement::Left, 142, 88, Side::Left),
            (Placement::Center, 193, 314, Side::Right),
            (Placement::Right, 244, 314, Side::Right),
        ] {
            anchor.placement = placement;
            assert_eq!(
                companion_geometry(
                    &anchor,
                    Character::Classic,
                    1.0,
                    PhysicalPosition::new(100, -13),
                    monitor
                ),
                Some(PeekGeometry {
                    position: PhysicalPosition::new(side_x, 4),
                    size: PhysicalSize::new(38, 30),
                    side: Some(side),
                })
            );
            assert_eq!(
                companion_geometry(
                    &anchor,
                    Character::Classic,
                    1.0,
                    PhysicalPosition::new(100, 87),
                    monitor
                ),
                Some(PeekGeometry {
                    position: PhysicalPosition::new(top_x, 70),
                    size: PhysicalSize::new(54, 30),
                    side: None,
                })
            );
        }
        anchor.placement = Placement::Left;
        assert_eq!(
            companion_geometry(
                &anchor,
                Character::Classic,
                1.0,
                PhysicalPosition::new(-20, -13),
                monitor
            )
            .and_then(|geometry| geometry.side),
            Some(Side::Right)
        );
        anchor.placement = Placement::Center;
        assert_eq!(
            companion_geometry(
                &anchor,
                Character::Classic,
                1.0,
                PhysicalPosition::new(1680, -13),
                monitor
            )
            .and_then(|geometry| geometry.side),
            Some(Side::Left)
        );
        anchor.placement = Placement::Left;
        assert_eq!(
            companion_geometry(
                &anchor,
                Character::Golden,
                1.0,
                PhysicalPosition::new(100, -13),
                monitor
            ),
            Some(PeekGeometry {
                position: PhysicalPosition::new(89, 1),
                size: PhysicalSize::new(38, 36),
                side: Some(Side::Left),
            })
        );
        assert_eq!(
            companion_geometry(
                &anchor,
                Character::Golden,
                1.0,
                PhysicalPosition::new(100, 87),
                monitor
            ),
            Some(PeekGeometry {
                position: PhysicalPosition::new(142, 70),
                size: PhysicalSize::new(54, 30),
                side: None,
            })
        );
    }

    #[test]
    fn golden_side_peek_fits_the_visible_capsule_at_different_scales() {
        let monitor = Some((PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)));
        let origin = PhysicalPosition::new(100, -13);
        for scale in [0.8_f64, 1.0, 1.25, 1.4] {
            for panel_height in [32.0, 38.0, 42.0, 44.0] {
                let anchor = PeekAnchor {
                    x: 20.0,
                    y: 13.0,
                    width: 200.0,
                    height: panel_height,
                    placement: Placement::Right,
                };
                let geometry =
                    companion_geometry(&anchor, Character::Golden, scale, origin, monitor)
                        .expect("side companion fits");
                let top = (origin.y + (anchor.y * scale).round() as i32).max(0);
                let bottom = origin.y + ((anchor.y + anchor.height) * scale).round() as i32;
                assert_eq!(geometry.side, Some(Side::Right));
                assert!(geometry.position.y > top);
                assert!(geometry.position.y + (geometry.size.height as i32) < bottom);
            }
        }
    }
}
