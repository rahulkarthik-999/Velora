//! Local text extraction from resumes and job descriptions (PDF, DOCX, TXT/MD).

use std::{io::Read, path::Path};

use quick_xml::{events::Event, Reader};

use crate::error::{AppError, AppResult};

pub const MAX_FILE_BYTES: u64 = 15 * 1024 * 1024;
/// Matches the server's resume limit.
pub const MAX_TEXT_CHARS: usize = 30_000;

pub fn extract_text(path: &Path) -> AppResult<String> {
    let size = std::fs::metadata(path)?.len();
    if size > MAX_FILE_BYTES {
        return Err(AppError::InvalidSettings("That file is larger than 15 MB.".into()));
    }
    let bytes = std::fs::read(path)?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let raw = match ext.as_str() {
        "txt" | "md" => String::from_utf8_lossy(&bytes).into_owned(),
        "pdf" => pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| AppError::InvalidSettings(format!("Could not read this PDF ({e}). Try saving it as DOCX or text.")))?,
        "docx" => docx_text(&bytes)?,
        "doc" => {
            return Err(AppError::InvalidSettings(
                "Old .doc files aren't supported. Save it as .docx or PDF in Word first.".into(),
            ))
        }
        _ => return Err(AppError::InvalidSettings("Choose a PDF, DOCX or TXT file.".into())),
    };
    let text = tidy(&raw);
    if text.chars().filter(|c| c.is_alphanumeric()).count() < 50 {
        return Err(AppError::InvalidSettings(
            "No readable text was found. If this is a scanned PDF, export it as text or DOCX instead.".into(),
        ));
    }
    Ok(text.chars().take(MAX_TEXT_CHARS).collect())
}

/// Reads paragraph text from word/document.xml inside a .docx.
pub fn docx_text(bytes: &[u8]) -> AppResult<String> {
    let bad = |e: String| AppError::InvalidSettings(format!("Could not read this DOCX ({e})."));
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| bad(e.to_string()))?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|e| bad(e.to_string()))?
        .read_to_string(&mut xml)
        .map_err(|e| bad(e.to_string()))?;

    let mut reader = Reader::from_str(&xml);
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event().map_err(|e| bad(e.to_string()))? {
            Event::Start(e) if e.local_name().as_ref() == "t" => in_text = true,
            Event::End(e) if e.local_name().as_ref() == "t" => in_text = false,
            Event::End(e) if e.local_name().as_ref() == "p" => out.push('\n'),
            Event::Empty(e) if e.local_name().as_ref() == "tab" => out.push('\t'),
            Event::Empty(e) if e.local_name().as_ref() == "br" => out.push('\n'),
            Event::Text(t) if in_text => out.push_str(&t.xml10_content()),
            Event::GeneralRef(r) if in_text => {
                // Entities such as &amp; and &#8217; arrive as separate events.
                if let Some(c) = entity_char(&r.xml10_content()) {
                    out.push(c);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(out)
}

fn entity_char(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => {
            let num = name.strip_prefix('#')?;
            let code = match num.strip_prefix('x').or_else(|| num.strip_prefix('X')) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => num.parse().ok()?,
            };
            char::from_u32(code)
        }
    }
}

/// Trims each line and collapses runs of blank lines.
pub fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank = 0;
    for line in text.lines() {
        let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        out.push_str(&line);
        out.push('\n');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn make_docx(body: &str) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            zip.start_file("word/document.xml", opts).unwrap();
            write!(
                zip,
                r#"<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>"#
            )
            .unwrap();
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn reads_docx_paragraphs_runs_and_entities() {
        let doc = make_docx(
            r#"<w:p><w:r><w:t>Jane Doe</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Backend </w:t></w:r><w:r><w:t>Engineer &amp; Mentor &#8212; Jane&#x2019;s</w:t></w:r></w:p>"#,
        );
        assert_eq!(docx_text(&doc).unwrap().trim(), "Jane Doe\nBackend Engineer & Mentor — Jane’s");
    }

    #[test]
    fn rejects_non_docx_bytes() {
        assert!(docx_text(b"definitely not a zip").is_err());
    }

    #[test]
    fn tidies_whitespace() {
        assert_eq!(tidy("  a   b \n\n\n\n c\t\td  "), "a b\n\nc d");
    }

    #[test]
    fn extracts_text_files_and_rejects_unknown_types() {
        let dir = tempfile::tempdir().unwrap();
        let txt = dir.path().join("resume.txt");
        std::fs::write(&txt, "Jane Doe\nSenior backend engineer with 6 years of Rust, Go and Postgres experience.").unwrap();
        assert!(extract_text(&txt).unwrap().starts_with("Jane Doe"));

        let other = dir.path().join("resume.png");
        std::fs::write(&other, "x").unwrap();
        assert!(extract_text(&other).is_err());

        let short = dir.path().join("short.txt");
        std::fs::write(&short, "hi").unwrap();
        assert!(extract_text(&short).is_err());
    }
}
