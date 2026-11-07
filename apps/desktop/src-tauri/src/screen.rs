//! Screen capture for visual question analysis. Captures the primary screen,
//! downscales to <=1280px width, and encodes to a fast base64 PNG data URI.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use crate::error::{AppError, AppResult};

#[cfg(target_os = "windows")]
pub fn capture_screen_base64() -> AppResult<String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);
        if width <= 0 || height <= 0 {
            return Err(AppError::Internal("Could not determine screen dimensions.".into()));
        }

        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        if hdc_screen.0.is_null() {
            return Err(AppError::Internal("Could not access screen device context.".into()));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_bmp = SelectObject(hdc_mem, hbm);

        let success = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
        if let Err(e) = success {
            SelectObject(hdc_mem, old_bmp);
            let _ = DeleteObject(hbm);
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err(AppError::Internal(format!("Screen capture BitBlt failed: {e}")));
        }

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down orientation
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            height as u32,
            Some(bgra.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bmp);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        if lines == 0 {
            return Err(AppError::Internal("Failed to extract screen pixels.".into()));
        }

        // Downscale so max width is <= 1280px for ultra-fast upload and low-latency AI vision analysis
        let scale = ((width + 1279) / 1280).max(1);
        let out_w = (width / scale) as u32;
        let out_h = (height / scale) as u32;

        // Encode RGB (3 bytes/pixel, no alpha channel needed) with fast compression
        let mut rgb = Vec::with_capacity((out_w * out_h * 3) as usize);
        for y in 0..out_h {
            let src_y = y * (scale as u32);
            let row_offset = (src_y * (width as u32)) as usize;
            for x in 0..out_w {
                let src_x = x * (scale as u32);
                let idx = (row_offset + (src_x as usize)) * 4;
                rgb.push(bgra[idx + 2]); // R
                rgb.push(bgra[idx + 1]); // G
                rgb.push(bgra[idx]);     // B
            }
        }

        let mut png_bytes = Vec::with_capacity((out_w * out_h) as usize);
        let mut encoder = png::Encoder::new(&mut png_bytes, out_w, out_h);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header().map_err(|e| AppError::Internal(e.to_string()))?;
        writer.write_image_data(&rgb).map_err(|e| AppError::Internal(e.to_string()))?;
        drop(writer);

        Ok(format!("data:image/png;base64,{}", BASE64.encode(&png_bytes)))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_screen_base64() -> AppResult<String> {
    Err(AppError::Internal("Screen capture is currently supported on Windows.".into()))
}
