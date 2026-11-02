pub mod engine;
pub mod models;
pub mod pipeline;


/// whisper.cpp's public-domain JFK sample, used to check a model actually transcribes.
pub const SELF_TEST_WAV: &[u8] = include_bytes!("../../third_party/whisper.cpp/samples/jfk.wav");
/// Words that must appear in the self-test transcript.
pub const SELF_TEST_EXPECT: &[&str] = &["country", "fellow americans"];
