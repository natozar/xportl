-- ============================================
-- XPORTL - Migration 003: Compliance & Legal Shield
-- LGPD + Marco Civil + CF/88 + ECA
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. USERS PROFILE (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id                          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name                TEXT NOT NULL DEFAULT 'Anonimo',
    phone_hash                  TEXT,          -- SHA-256 of phone (verification, never stored plain)
    cpf_hash                    TEXT,          -- SHA-256 of CPF (legal traceability)
    birth_date                  DATE,
    is_minor                    BOOLEAN GENERATED ALWAYS AS (
                                    birth_date IS NOT NULL AND birth_date > (CURRENT_DATE - INTERVAL '18 years')
                                ) STORED,
    account_status              TEXT NOT NULL DEFAULT 'active'
                                    CHECK (account_status IN ('active','suspended','shadowbanned','banned','deleted')),
    accepted_tos_version        TEXT,
    accepted_tos_at             TIMESTAMPTZ,
    accepted_location_disclaimer BOOLEAN NOT NULL DEFAULT false,
    accepted_location_disclaimer_at TIMESTAMPTZ,
    total_flags_received        INTEGER NOT NULL DEFAULT 0,
    total_capsules_removed      INTEGER NOT NULL DEFAULT 0,
    suspended_until             TIMESTAMPTZ,
    ban_reason                  TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON user_profiles(account_status);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Anonimo'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS for profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE USING (id = auth.uid());

-- ============================================
-- 2. ACCESS LOGS (Marco Civil Art. 15 — 6 months minimum)
-- ============================================
CREATE TABLE IF NOT EXISTS access_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    target_id       UUID,
    ip_address      TEXT,           -- Store encrypted at app level
    user_agent      TEXT,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    metadata        JSONB DEFAULT '{}',
    legal_hold      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON access_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created ON access_logs(created_at);

ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can read logs (not public)
CREATE POLICY "Service only access logs"
    ON access_logs FOR ALL USING (false);

-- Allow inserts from authenticated users (via RPC)
CREATE POLICY "Authenticated can insert logs"
    ON access_logs FOR INSERT
    WITH CHECK (true);

-- ============================================
-- 3. REPORTS / DENUNCIAS
-- ============================================
CREATE TYPE report_reason AS ENUM (
    'harassment', 'hate_speech', 'doxxing', 'threats',
    'illegal_content', 'misinformation', 'dangerous_location',
    'spam', 'copyright', 'csam', 'other'
);

CREATE TYPE report_status AS ENUM (
    'pending', 'reviewed', 'actioned', 'dismissed'
);

CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID NOT NULL REFERENCES auth.users(id),
    target_type     TEXT NOT NULL CHECK (target_type IN ('capsule','user','ping')),
    target_id       UUID NOT NULL,
    reason          report_reason NOT NULL,
    description     TEXT,
    reporter_ip     TEXT,
    status          report_status NOT NULL DEFAULT 'pending',
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    action_taken    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can create reports"
    ON reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can read own reports"
    ON reports FOR SELECT USING (reporter_id = auth.uid());

-- ============================================
-- 4. RESTRICTED ZONES (Geofencing)
-- ============================================
CREATE TABLE IF NOT EXISTS restricted_zones (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_name   TEXT NOT NULL,
    zone_type   TEXT NOT NULL CHECK (zone_type IN (
        'military','school','hospital','highway','airport',
        'court','police_station','private_critical','custom'
    )),
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    radius_m    INTEGER NOT NULL DEFAULT 100,
    location    GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
                    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
                ) STORED,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zones_location ON restricted_zones USING GIST(location);

-- Check if coordinates are in a restricted zone
CREATE OR REPLACE FUNCTION is_restricted_zone(check_lat DOUBLE PRECISION, check_lng DOUBLE PRECISION)
RETURNS TABLE (zone_name TEXT, zone_type TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT rz.zone_name, rz.zone_type
    FROM restricted_zones rz
    WHERE rz.active = true
      AND ST_DWithin(
          rz.location,
          ST_SetSRID(ST_MakePoint(check_lng, check_lat), 4326)::geography,
          rz.radius_m
      )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 5. RATE LIMITING
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    action      TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    count       INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_user_action ON rate_limits(user_id, action);

-- Check and increment rate limit. Returns true if allowed.
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id UUID,
    p_action TEXT,
    p_max_count INTEGER,
    p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    window_start TIMESTAMPTZ;
BEGIN
    window_start := date_trunc('hour', NOW());

    SELECT count INTO current_count
    FROM rate_limits
    WHERE user_id = p_user_id
      AND action = p_action
      AND rate_limits.window_start >= NOW() - (p_window_minutes || ' minutes')::interval;

    IF current_count IS NULL THEN
        INSERT INTO rate_limits (user_id, action, window_start, count)
        VALUES (p_user_id, p_action, NOW(), 1)
        ON CONFLICT (user_id, action, window_start) DO UPDATE SET count = rate_limits.count + 1;
        RETURN true;
    END IF;

    IF current_count >= p_max_count THEN
        RETURN false;
    END IF;

    UPDATE rate_limits
    SET count = count + 1
    WHERE user_id = p_user_id
      AND action = p_action
      AND rate_limits.window_start >= NOW() - (p_window_minutes || ' minutes')::interval;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. ADD COMPLIANCE COLUMNS TO CAPSULES
-- ============================================
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS created_ip TEXT;
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS created_user_agent TEXT;
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active','flagged','under_review','removed'));
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS flag_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS removed_reason TEXT;
ALTER TABLE capsules ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_capsules_moderation ON capsules(moderation_status);
CREATE INDEX IF NOT EXISTS idx_capsules_flags ON capsules(flag_count) WHERE flag_count > 0;

-- ============================================
-- 7. AUTO-MODERATION FUNCTIONS
-- ============================================

-- Increment flag count and auto-moderate
CREATE OR REPLACE FUNCTION handle_capsule_report(capsule_id UUID)
RETURNS TEXT AS $$
DECLARE
    new_count INTEGER;
    result TEXT;
BEGIN
    UPDATE capsules
    SET flag_count = flag_count + 1,
        updated_at = NOW()
    WHERE id = capsule_id
    RETURNING flag_count INTO new_count;

    IF new_count >= 5 THEN
        UPDATE capsules SET moderation_status = 'removed', removed_at = NOW(), removed_reason = 'auto_5_flags' WHERE id = capsule_id;
        result := 'removed';
    ELSIF new_count >= 3 THEN
        UPDATE capsules SET moderation_status = 'under_review' WHERE id = capsule_id;
        result := 'under_review';
    ELSE
        UPDATE capsules SET moderation_status = 'flagged' WHERE id = capsule_id;
        result := 'flagged';
    END IF;

    -- Escalate user bans
    PERFORM escalate_user_penalties(
        (SELECT created_by FROM capsules WHERE id = capsule_id)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Escalate user penalties based on removed capsules
CREATE OR REPLACE FUNCTION escalate_user_penalties(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    removed_count INTEGER;
BEGIN
    IF p_user_id IS NULL THEN RETURN; END IF;

    SELECT COUNT(*) INTO removed_count
    FROM capsules
    WHERE created_by = p_user_id AND moderation_status = 'removed';

    UPDATE user_profiles SET total_capsules_removed = removed_count WHERE id = p_user_id;

    IF removed_count >= 5 THEN
        UPDATE user_profiles
        SET account_status = 'banned', ban_reason = 'auto_5_removals', updated_at = NOW()
        WHERE id = p_user_id AND account_status != 'banned';
    ELSIF removed_count >= 3 THEN
        UPDATE user_profiles
        SET account_status = 'suspended',
            suspended_until = NOW() + INTERVAL '7 days',
            updated_at = NOW()
        WHERE id = p_user_id AND account_status NOT IN ('banned','suspended');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. CLEANUP: Auto-purge old rate limits and logs
-- ============================================
-- Run via Supabase cron (pg_cron) or external scheduler

-- Delete rate limit entries older than 24h
-- SELECT cron.schedule('cleanup-rate-limits', '0 */6 * * *', $$
--     DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '24 hours';
-- $$);

-- Delete access logs older than 12 months (unless legal hold)
-- SELECT cron.schedule('cleanup-access-logs', '0 3 1 * *', $$
--     DELETE FROM access_logs WHERE created_at < NOW() - INTERVAL '12 months' AND legal_hold = false;
-- $$);
