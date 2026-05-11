CREATE TABLE uploads (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES auth.users,
    file_name     TEXT        NOT NULL,
    file_type     TEXT        NOT NULL,        -- 'pdf' | 'pptx' | 'audio'
    storage_path  TEXT        NOT NULL,        -- path in Supabase Storage bucket
    subject       TEXT,
    status        TEXT        NOT NULL DEFAULT 'pending',
                                               -- pending | processing_parse
                                               -- processing_ai | done | error
    chunk_count   INTEGER     NOT NULL DEFAULT 0,
    card_count    INTEGER     NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON uploads (user_id, created_at DESC);

CREATE TABLE chunks (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id     UUID        NOT NULL REFERENCES uploads ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES auth.users,
    type          TEXT        NOT NULL,   -- 'heading' | 'body' | 'notes' | 'transcript'
    text          TEXT        NOT NULL,
    page_or_slide INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON chunks (upload_id);
CREATE INDEX ON chunks (user_id);

CREATE TABLE cards (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id    UUID        NOT NULL REFERENCES uploads ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES auth.users,
    question     TEXT        NOT NULL,
    answer       TEXT        NOT NULL,
    tags         TEXT[]      NOT NULL DEFAULT '{}',
    difficulty   INTEGER     NOT NULL DEFAULT 3,  -- AI-estimated 1–5

    -- SM-2 state (see sm2-algorithm.md)
    easiness     FLOAT       NOT NULL DEFAULT 2.5,
    interval     INTEGER     NOT NULL DEFAULT 1,   -- days
    repetitions  INTEGER     NOT NULL DEFAULT 0,
    next_review  DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON cards (user_id, next_review);
CREATE INDEX ON cards (upload_id);

CREATE TABLE exam_questions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id    UUID        NOT NULL REFERENCES uploads ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES auth.users,
    type         TEXT        NOT NULL,   -- 'mcq' | 'short' | 'essay'
    question     TEXT        NOT NULL,
    options      TEXT[],               -- 4 strings for MCQ, NULL otherwise
    correct_index INTEGER,             -- 0–3 for MCQ, NULL otherwise
    mark_scheme  TEXT        NOT NULL,
    marks        INTEGER     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON exam_questions (upload_id);

CREATE TABLE concept_maps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id   UUID        NOT NULL REFERENCES uploads ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users,
    graph       JSONB       NOT NULL,  -- { nodes: [...], edges: [...] }
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON concept_maps (upload_id);

CREATE TABLE review_sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id     UUID        NOT NULL REFERENCES cards ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users,
    quality     INTEGER     NOT NULL,  -- 0–5 (SM-2 quality score)
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON review_sessions (user_id, reviewed_at DESC);
CREATE INDEX ON review_sessions (card_id);

-- Enable RLS on all user-facing tables
ALTER TABLE uploads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_maps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

-- Each user can only see and modify their own rows
CREATE POLICY "own data" ON uploads         FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own data" ON chunks          FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own data" ON cards           FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own data" ON exam_questions  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own data" ON concept_maps    FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own data" ON review_sessions FOR ALL USING (user_id = auth.uid());

-- Storage bucket (run in Supabase dashboard or via management API)
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false);

-- Users can only read/write their own files
CREATE POLICY "own files" ON storage.objects
    FOR ALL USING (
        bucket_id = 'uploads'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
