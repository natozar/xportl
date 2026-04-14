-- ============================================
-- XPORTL - Migration 009: Server-side geofence enforcement
-- Prevents capsule creation in restricted zones even via direct API
-- ============================================

CREATE OR REPLACE FUNCTION enforce_geofence()
RETURNS TRIGGER AS $$
DECLARE
    zone RECORD;
BEGIN
    SELECT rz.zone_name, rz.zone_type INTO zone
    FROM restricted_zones rz
    WHERE rz.active = true
      AND ST_DWithin(
          rz.location,
          ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography,
          rz.radius_m
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Capsule creation blocked: restricted zone "%" (%)', zone.zone_name, zone.zone_type;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_geofence_before_insert ON capsules;
CREATE TRIGGER check_geofence_before_insert
    BEFORE INSERT ON capsules
    FOR EACH ROW
    EXECUTE FUNCTION enforce_geofence();
