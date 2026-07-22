use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use std::fs::{self, File};
use std::path::Path;

fn main() {
    ensure_windows_icon();
    allow_missing_extension_for_dev_checks();
    tauri_build::build()
}

fn allow_missing_extension_for_dev_checks() {
    let release_build = std::env::var("PROFILE").is_ok_and(|profile| profile == "release");
    let extension_built = Path::new("../extension/build/manifest.json").is_file();

    // Cargo unit tests and `cargo check` should not need Node. Production
    // builds remain fail-closed: release packaging still requires the exact
    // extension/build directory declared in tauri.conf.json.
    if !release_build && !extension_built && std::env::var_os("TAURI_CONFIG").is_none() {
        std::env::set_var("TAURI_CONFIG", r#"{"bundle":{"resources":null}}"#);
    }
}

fn ensure_windows_icon() {
    let icon_path = Path::new("icons").join("icon.ico");
    if icon_path.is_file() {
        return;
    }

    fs::create_dir_all("icons").expect("failed to create icons directory");
    let mut directory = IconDir::new(ResourceType::Icon);
    for size in [16_u32, 32, 48, 256] {
        let image = IconImage::from_rgba_data(size, size, draw_icon(size));
        directory.add_entry(IconDirEntry::encode(&image).expect("failed to encode app icon"));
    }
    let mut file = File::create(icon_path).expect("failed to create Windows app icon");
    directory
        .write(&mut file)
        .expect("failed to write Windows app icon");
}

fn draw_icon(size: u32) -> Vec<u8> {
    let mut rgba = vec![0_u8; (size * size * 4) as usize];
    let radius = size as f32 * 0.19;
    let orange = [255_u8, 85, 22, 255];
    let panel = [17_u8, 19, 23, 255];

    for y in 0..size {
        for x in 0..size {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let edge_x = px.min(size as f32 - px);
            let edge_y = py.min(size as f32 - py);
            let corner_x = (radius - edge_x).max(0.0);
            let corner_y = (radius - edge_y).max(0.0);
            let inside = corner_x * corner_x + corner_y * corner_y <= radius * radius;
            if inside {
                set_pixel(&mut rgba, size, x, y, panel);
            }
        }
    }

    let left = size * 27 / 100;
    let right = size * 73 / 100;
    let top = size * 22 / 100;
    let bar = (size * 13 / 100).max(2);
    let middle = size * 44 / 100;
    let bottom = size * 66 / 100;
    fill_rect(&mut rgba, size, left, top, left + bar, bottom + bar, orange);
    fill_rect(&mut rgba, size, left, top, right, top + bar, orange);
    fill_rect(
        &mut rgba,
        size,
        left,
        middle,
        right - size / 12,
        middle + bar,
        orange,
    );
    fill_rect(&mut rgba, size, left, bottom, right, bottom + bar, orange);
    rgba
}

fn fill_rect(
    rgba: &mut [u8],
    size: u32,
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
    color: [u8; 4],
) {
    for y in top.min(size)..bottom.min(size) {
        for x in left.min(size)..right.min(size) {
            set_pixel(rgba, size, x, y, color);
        }
    }
}

fn set_pixel(rgba: &mut [u8], size: u32, x: u32, y: u32, color: [u8; 4]) {
    let offset = ((y * size + x) * 4) as usize;
    rgba[offset..offset + 4].copy_from_slice(&color);
}
