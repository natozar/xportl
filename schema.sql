-- ============================================
-- XPORTL - Database Schema (Supabase/PostgreSQL)
-- Phase 1 MVP
-- ============================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM: Visibility layers
-- ============================================
CREATE TYPE visibility_layer AS ENUM ('public', 'ghost', 'private');

-- ============================================
-- TABLE: capsules
-- Core entity - digital time capsules anchored to physical locations
-- ============================================
CREATE TABLE capsules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Geospatial
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    altitude        DOUBLE PRECISION,
    location        GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
                        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
                    ) STORED,

    -- Content (JSONB for flexibility: text, audio URL, enigma, etc.)
    content         JSONB NOT NULL DEFAULT '{}',

    -- Visibility & access control
    visibility_layer visibility_layer NOT NULL DEFAULT 'public',

    -- Temporal lock - capsule can't be opened before this date
    unlock_date     TIMESTAMPTZ,

    -- Metrics
    views_count     INTEGER NOT NULL DEFAULT 0,

    -- Ownership (links to Supabase auth.users)
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Spatial index for proximity queries (critical for performance)
CREATE INDEX idx_capsules_location ON capsules USING GIST (location);

-- Filter by visibility layer
CREATE INDEX idx_capsules_visibility ON capsules (visibility_layer);

-- Filter by unlock date (for temporal locks)
CREATE INDEX idx_capsules_unlock ON capsules (unlock_date) WHERE unlock_date IS NOT NULL;

-- Owner lookup
CREATE INDEX idx_capsules_created_by ON capsules (created_by);

-- ============================================
-- FUNCTION: Find capsules within radius
-- ============================================
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
    distance_meters DOUBLE PRECISION,
    created_at      TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.lat,
        c.lng,
        c.altitude,
        c.content,
        c.visibility_layer,
        c.unlock_date,
        c.views_count,
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
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCTION: Increment view count
-- ============================================
CREATE OR REPLACE FUNCTION increment_views(capsule_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE capsules
    SET views_count = views_count + 1,
        updated_at = NOW()
    WHERE id = capsule_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS (Row Level Security) - Supabase auth
-- ============================================
ALTER TABLE capsules ENABLE ROW LEVEL SECURITY;

-- Anyone can read public capsules
CREATE POLICY "Public capsules are visible to all"
    ON capsules FOR SELECT
    USING (visibility_layer = 'public');

-- Ghost capsules visible to authenticated users
CREATE POLICY "Ghost capsules visible to authenticated"
    ON capsules FOR SELECT
    USING (visibility_layer = 'ghost' AND auth.role() = 'authenticated');

-- Private capsules only visible to owner
CREATE POLICY "Private capsules visible to owner"
    ON capsules FOR SELECT
    USING (visibility_layer = 'private' AND created_by = auth.uid());

-- Authenticated users can create capsules
CREATE POLICY "Authenticated users can create capsules"
    ON capsules FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Owners can update their own capsules
CREATE POLICY "Owners can update own capsules"
    ON capsules FOR UPDATE
    USING (created_by = auth.uid());

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capsules_updated_at
    BEFORE UPDATE ON capsules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
