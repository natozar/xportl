-- ============================================
-- XPORTL - Migration 010: Gamification (XP, Levels, Badges)
-- ============================================

-- ── XP Ledger (append-only log of all XP earned) ──
CREATE TABLE IF NOT EXISTS xp_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,      -- 'create_capsule','discover_capsule','receive_view','first_ghost','streak_7d'
    xp_amount   INTEGER NOT NULL,
    capsule_id  UUID,               -- optional: which capsule triggered this
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_events(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_created ON xp_events(created_at);

-- ── Aggregated XP per user (materialized for fast reads) ──
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_active_date DATE;

-- ── Award XP and recalculate level ──
CREATE OR REPLACE FUNCTION award_xp(
    p_user_id UUID,
    p_action TEXT,
    p_xp INTEGER,
    p_capsule_id UUID DEFAULT NULL
)
RETURNS TABLE (new_total INTEGER, new_level INTEGER, leveled_up BOOLEAN) AS $$
DECLARE
    old_level INTEGER;
    new_xp INTEGER;
    calc_level INTEGER;
BEGIN
    -- Insert event
    INSERT INTO xp_events (user_id, action, xp_amount, capsule_id)
    VALUES (p_user_id, p_action, p_xp, p_capsule_id);

    -- Get current level
    SELECT level INTO old_level FROM user_profiles WHERE id = p_user_id;

    -- Update total + recalc level
    UPDATE user_profiles
    SET total_xp = total_xp + p_xp,
        level = GREATEST(1, FLOOR(SQRT((total_xp + p_xp) / 50.0)) + 1),
        last_active_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING total_xp, user_profiles.level INTO new_xp, calc_level;

    new_total := new_xp;
    new_level := calc_level;
    leveled_up := calc_level > COALESCE(old_level, 1);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ── Streak tracking (call daily or on login) ──
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    last_date DATE;
    current_streak INTEGER;
BEGIN
    SELECT last_active_date, streak_days INTO last_date, current_streak
    FROM user_profiles WHERE id = p_user_id;

    IF last_date = CURRENT_DATE THEN
        -- Already active today
        RETURN current_streak;
    ELSIF last_date = CURRENT_DATE - 1 THEN
        -- Consecutive day
        current_streak := COALESCE(current_streak, 0) + 1;
    ELSE
        -- Streak broken
        current_streak := 1;
    END IF;

    UPDATE user_profiles
    SET streak_days = current_streak,
        last_active_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN current_streak;
END;
$$ LANGUAGE plpgsql;

-- ── Grant badge ──
CREATE OR REPLACE FUNCTION grant_badge(p_user_id UUID, p_badge_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_badges JSONB;
BEGIN
    SELECT badges INTO current_badges FROM user_profiles WHERE id = p_user_id;

    -- Check if already has badge
    IF current_badges @> to_jsonb(p_badge_id) THEN
        RETURN false;
    END IF;

    UPDATE user_profiles
    SET badges = badges || to_jsonb(p_badge_id),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ── Leaderboard query (top 50 by XP, optionally filtered by region) ──
CREATE OR REPLACE FUNCTION get_leaderboard(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    user_id     UUID,
    display_name TEXT,
    total_xp    INTEGER,
    level       INTEGER,
    badges      JSONB,
    streak_days INTEGER,
    rank        BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        up.id,
        up.display_name,
        up.total_xp,
        up.level,
        up.badges,
        up.streak_days,
        ROW_NUMBER() OVER (ORDER BY up.total_xp DESC) AS rank
    FROM user_profiles up
    WHERE up.account_status = 'active'
      AND up.total_xp > 0
    ORDER BY up.total_xp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── RLS: XP events readable by owner ──
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own XP events"
    ON xp_events FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert XP events"
    ON xp_events FOR INSERT WITH CHECK (true);
