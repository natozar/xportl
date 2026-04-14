-- ============================================
-- XPLORE - Migration 002: Ghost Layer + Media
-- Run this in Supabase SQL Editor
-- ============================================

-- Add media columns
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS media_type TEXT; -- 'image' | 'audio' | null

-- Add ghost views counter (null = unlimited, number = countdown)
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS views_left INTEGER;

-- Update the RPC to include new columns
CREATE OR REPLACE FUNCTION get_nearby_capsules(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 50,
    layer visibility_layer DEFAULT 'public'
)
RETURNS TABLE (
    id              UUID,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    altitude        DOUBLE PRECISION,
    content         JSONB,
    visibility_layer visibility_layer,
    unlock_date     TIMESTAMPTZ,
    views_count     INTEGER,
    views_left      INTEGER,
    media_url       TEXT,
    media_type      TEXT,
    distance_meters DOUBLE PRECISION,
    created_at      TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id, c.lat, c.lng, c.altitude, c.content,
        c.visibility_layer, c.unlock_date, c.views_count,
        c.views_left, c.media_url, c.media_type,
        ST_Distance(
            c.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) AS distance_meters,
        c.created_at
    FROM capsules c
    WHERE
        ST_DWithin(
            c.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_meters
        )
        AND (c.visibility_layer = layer OR c.visibility_layer = 'public')
        AND (c.unlock_date IS NULL OR c.unlock_date <= NOW())
        AND (c.views_left IS NULL OR c.views_left > 0)
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to decrement views and return remaining count
CREATE OR REPLACE FUNCTION consume_capsule_view(capsule_id UUID)
RETURNS INTEGER AS $$
DECLARE
    remaining INTEGER;
BEGIN
    UPDATE capsules
    SET views_count = views_count + 1,
        views_left = CASE WHEN views_left IS NOT NULL THEN views_left - 1 ELSE NULL END,
        updated_at = NOW()
    WHERE id = capsule_id
      AND (views_left IS NULL OR views_left > 0)
    RETURNING views_left INTO remaining;

    RETURN remaining;
END;
$$ LANGUAGE plpgsql;

-- Function to self-destruct a capsule (delete row + return media_url for cleanup)
CREATE OR REPLACE FUNCTION self_destruct_capsule(capsule_id UUID)
RETURNS TEXT AS $$
DECLARE
    url TEXT;
BEGIN
    DELETE FROM capsules WHERE id = capsule_id RETURNING media_url INTO url;
    RETURN url;
END;
$$ LANGUAGE plpgsql;

-- Storage bucket for capsule media (run once)
-- NOTE: This must be done via Supabase Dashboard > Storage > Create Bucket
-- Bucket name: capsule-media
-- Public: true (for public URL access)
-- File size limit: 10MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, audio/webm, audio/ogg, audio/mp4

-- Storage policies (run after creating the bucket)
CREATE POLICY "Anyone can upload capsule media"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'capsule-media');

CREATE POLICY "Anyone can read capsule media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'capsule-media');

CREATE POLICY "Anyone can delete capsule media"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'capsule-media');
