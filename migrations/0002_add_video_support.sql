-- Add media_type column to distinguish images from videos.
-- Defaults to 'image' for backward compatibility with existing rows.
ALTER TABLE uploads ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';

-- Add duration column for video files (seconds, nullable).
ALTER TABLE uploads ADD COLUMN duration REAL;
