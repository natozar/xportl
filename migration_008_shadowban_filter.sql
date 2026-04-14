-- ============================================
-- XPORTL - Migration 008: Shadowban filtering in queries
-- Shadowbanned users' capsules are invisible to everyone except the author.
-- ============================================

-- Update the proximity RPC to exclude capsules from shadowbanned users
-- (unless the requesting user IS the author)
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
    created_at      TIMESTAMPTZ,
    created_by      UUID
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
        c.created_at,
        c.created_by
    FROM capsules c
    LEFT JOIN user_profiles up ON up.id = c.created_by
    WHERE
        ST_DWithin(
            c.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_meters
        )
        AND (c.visibility_layer = layer OR c.visibility_layer = 'public')
        AND (c.unlock_date IS NULL OR c.unlock_date <= NOW())
        AND (c.views_left IS NULL OR c.views_left > 0)
        AND c.moderation_status = 'active'
        -- Shadowban: hide capsules from shadowbanned users (unless viewer is the author)
        AND (
            up.account_status IS NULL
            OR up.account_status != 'shadowbanned'
            OR c.created_by = auth.uid()
        )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;
