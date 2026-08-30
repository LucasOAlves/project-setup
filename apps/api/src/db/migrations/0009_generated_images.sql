CREATE TABLE IF NOT EXISTS generated_images (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES generated_posts(id) ON DELETE CASCADE,
  brief_payload jsonb NOT NULL,
  prompt text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_images_post_created_idx
  ON generated_images (post_id, created_at DESC);
