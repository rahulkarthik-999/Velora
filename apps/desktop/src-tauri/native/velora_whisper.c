// Thin C layer over whisper.cpp.
//
// whisper.cpp's API passes large structs by value (whisper_full_params,
// whisper_context_params). Letting the C compiler build those keeps their
// layout correct on every platform, so Rust only crosses this boundary with
// pointers, integers and floats.

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <wchar.h>

#include "whisper.h"

// ---------------------------------------------------------------------------
// Model loading from a UTF-16 path (fopen can't open non-ASCII paths on Windows)
// ---------------------------------------------------------------------------

static size_t vw_read(void *ctx, void *output, size_t read_size) {
    return fread(output, 1, read_size, (FILE *)ctx);
}

static bool vw_eof(void *ctx) {
    return feof((FILE *)ctx) != 0;
}

static void vw_close(void *ctx) {
    fclose((FILE *)ctx);
}

static void vw_silent_log(enum ggml_log_level level, const char *text, void *user_data) {
    (void)level;
    (void)text;
    (void)user_data;
}

// Returns NULL if the file can't be opened or isn't a valid model.
struct whisper_context *vw_init(const wchar_t *path, int use_gpu) {
    whisper_log_set(vw_silent_log, NULL);

#ifdef _WIN32
    FILE *f = _wfopen(path, L"rb");
#else
    FILE *f = NULL;
    (void)path;
#endif
    if (!f) {
        return NULL;
    }

    whisper_model_loader loader = {
        .context = f,
        .read = vw_read,
        .eof = vw_eof,
        .close = vw_close,
    };

    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = use_gpu != 0;
    cparams.flash_attn = false;

    // whisper_init_with_params closes the loader itself.
    return whisper_init_with_params(&loader, cparams);
}

void vw_free(struct whisper_context *ctx) {
    if (ctx) {
        whisper_free(ctx);
    }
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

typedef struct vw_options {
    int32_t threads;
    int32_t beam_size;
    float temperature;
    float no_speech_threshold;
    // Optional UTF-8 prompt (vocabulary hints); may be NULL.
    const char *initial_prompt;
} vw_options;

typedef struct vw_segment {
    int64_t start_ms;
    int64_t end_ms;
    float no_speech_prob;
    // Mean probability of the segment's text tokens, 0..1.
    float avg_token_prob;
} vw_segment;

// Abort callback: lets Rust cancel a running transcription.
static bool vw_should_abort(void *user_data) {
    const volatile int32_t *flag = (const volatile int32_t *)user_data;
    return flag && *flag != 0;
}

// Returns the number of segments, or a negative whisper error code.
int32_t vw_transcribe(struct whisper_context *ctx, const float *samples, int32_t n_samples,
                      const vw_options *opts, const volatile int32_t *abort_flag) {
    if (!ctx || !samples || n_samples <= 0 || !opts) {
        return -100;
    }

    enum whisper_sampling_strategy strategy =
        opts->beam_size > 1 ? WHISPER_SAMPLING_BEAM_SEARCH : WHISPER_SAMPLING_GREEDY;
    struct whisper_full_params p = whisper_full_default_params(strategy);

    p.n_threads = opts->threads > 0 ? opts->threads : 2;
    p.language = "en";
    p.translate = false;
    p.detect_language = false;
    p.no_context = true;        // each speech segment is independent
    p.single_segment = false;
    p.print_progress = false;
    p.print_realtime = false;
    p.print_timestamps = false;
    p.print_special = false;
    p.suppress_blank = true;
    p.suppress_nst = true;      // drop "[MUSIC]", "(applause)" and similar
    p.temperature = opts->temperature;
    p.no_speech_thold = opts->no_speech_threshold;
    p.beam_search.beam_size = opts->beam_size > 1 ? opts->beam_size : 1;
    p.initial_prompt = opts->initial_prompt;
    p.abort_callback = vw_should_abort;
    p.abort_callback_user_data = (void *)abort_flag;

    int rc = whisper_full(ctx, p, samples, n_samples);
    if (rc != 0) {
        return rc < 0 ? rc : -rc;
    }
    return whisper_full_n_segments(ctx);
}

const char *vw_segment_text(struct whisper_context *ctx, int32_t i) {
    return whisper_full_get_segment_text(ctx, i);
}

void vw_segment_info(struct whisper_context *ctx, int32_t i, vw_segment *out) {
    // whisper timestamps are in 10 ms units.
    out->start_ms = whisper_full_get_segment_t0(ctx, i) * 10;
    out->end_ms = whisper_full_get_segment_t1(ctx, i) * 10;
    out->no_speech_prob = whisper_full_get_segment_no_speech_prob(ctx, i);

    const whisper_token eot = whisper_token_eot(ctx);
    int n = whisper_full_n_tokens(ctx, i);
    double sum = 0.0;
    int counted = 0;
    for (int t = 0; t < n; t++) {
        // Special tokens (timestamps, start/end markers) are >= EOT.
        if (whisper_full_get_token_id(ctx, i, t) >= eot) {
            continue;
        }
        sum += whisper_full_get_token_p(ctx, i, t);
        counted++;
    }
    out->avg_token_prob = counted > 0 ? (float)(sum / counted) : 0.0f;
}

const char *vw_system_info(void) {
    return whisper_print_system_info();
}
