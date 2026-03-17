-- ============================================================
--  Schema for hometown/uni connection app
--  Requires: PostgreSQL 14+ with PostGIS extension
--  Run: psql -U postgres -d your_db -f schema.sql
-- ============================================================

-- Enable PostGIS (run once per database)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
--  USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  avatar_url      TEXT,
  bio             TEXT,

  -- OAuth
  google_id       TEXT UNIQUE,
  apple_id        TEXT UNIQUE,

  -- Current location (PostGIS geography point — lat/lng)
  -- Stored as GEOGRAPHY so distance queries use metres automatically
  location        GEOGRAPHY(Point, 4326),
  city_label      TEXT,        -- human-readable e.g. "Fort Lauderdale, FL"

  -- Soft privacy controls
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
  radius_km       INT NOT NULL DEFAULT 50,   -- how far they want to appear to others

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index — makes radius queries very fast
CREATE INDEX idx_users_location ON users USING GIST (location);
CREATE INDEX idx_users_email    ON users (email);


-- ============================================================
--  TAGS  (the "places/institutions that shaped you" catalogue)
-- ============================================================
CREATE TYPE tag_type AS ENUM (
  'hometown',      -- city / town of origin  e.g. Kochi
  'country',       -- country of origin      e.g. India
  'university',    -- university / college   e.g. University of Florida
  'neighborhood',  -- specific area          e.g. Thrissur
  'other'
);

CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,                  -- e.g. "Kochi"
  type        tag_type NOT NULL,
  country     TEXT,                           -- ISO 3166-1 alpha-2  e.g. "IN"
  region      TEXT,                           -- state / province
  -- canonical lat/lng for the tag itself (used for map display, not matching)
  location    GEOGRAPHY(Point, 4326),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (name, type)                         -- no duplicate "Kochi (hometown)"
);

CREATE INDEX idx_tags_name ON tags USING GIN (to_tsvector('english', name));
CREATE INDEX idx_tags_type ON tags (type);


-- ============================================================
--  USER_TAGS  (which tags does each user have?)
-- ============================================================
CREATE TABLE user_tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, tag_id)                    -- no duplicates
);

CREATE INDEX idx_user_tags_user ON user_tags (user_id);
CREATE INDEX idx_user_tags_tag  ON user_tags (tag_id);


-- ============================================================
--  CONNECTIONS  (when two users connect / follow each other)
-- ============================================================
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE connections (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        connection_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (requester_id, receiver_id),
  CHECK (requester_id != receiver_id)         -- can't connect with yourself
);

CREATE INDEX idx_connections_requester ON connections (requester_id);
CREATE INDEX idx_connections_receiver  ON connections (receiver_id);


-- ============================================================
--  MESSAGES  (lightweight DM between connected users)
-- ============================================================
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_sender   ON messages (sender_id);
CREATE INDEX idx_messages_receiver ON messages (receiver_id);
CREATE INDEX idx_messages_thread   ON messages (sender_id, receiver_id, created_at DESC);


-- ============================================================
--  THE CORE MATCHING QUERY  (documented here for reference)
-- ============================================================
--
--  Find all users within :radius_km of a given point
--  who share at least one tag with the current user,
--  ranked by number of shared tags (most in common first).
--
--  Parameters:
--    :lng        -- current user's longitude
--    :lat        -- current user's latitude
--    :radius_m   -- search radius in metres  (e.g. 50km = 50000)
--    :user_id    -- current user's UUID (excluded from results)
--    :tag_ids    -- array of the current user's tag UUIDs
--
-- SELECT
--     u.id,
--     u.name,
--     u.avatar_url,
--     u.city_label,
--     COUNT(ut.tag_id)                        AS shared_tag_count,
--     ARRAY_AGG(t.name)                       AS shared_tag_names,
--     ST_Distance(u.location,
--       ST_MakePoint(:lng, :lat)::geography)  AS distance_m
-- FROM users u
-- JOIN user_tags ut  ON u.id       = ut.user_id
-- JOIN tags      t   ON ut.tag_id  = t.id
-- WHERE
--     u.id != :user_id
--     AND u.is_visible = TRUE
--     AND ut.tag_id = ANY(:tag_ids)
--     AND ST_DWithin(
--           u.location,
--           ST_MakePoint(:lng, :lat)::geography,
--           :radius_m
--         )
-- GROUP BY u.id, u.name, u.avatar_url, u.city_label, u.location
-- ORDER BY shared_tag_count DESC, distance_m ASC;
--
-- ============================================================


-- ============================================================
--  SEED DATA  (a few example tags to get started)
-- ============================================================
INSERT INTO tags (name, type, country, region) VALUES
  ('Kochi',                 'hometown',   'IN', 'Kerala'),
  ('Thrissur',              'hometown',   'IN', 'Kerala'),
  ('Thiruvananthapuram',    'hometown',   'IN', 'Kerala'),
  ('Mumbai',                'hometown',   'IN', 'Maharashtra'),
  ('Chennai',               'hometown',   'IN', 'Tamil Nadu'),
  ('Bengaluru',             'hometown',   'IN', 'Karnataka'),
  ('India',                 'country',    'IN', NULL),
  ('Pakistan',              'country',    'PK', NULL),
  ('Philippines',           'country',    'PH', NULL),
  ('Brazil',                'country',    'BR', NULL),
  ('University of Florida', 'university', 'US', 'FL'),
  ('Florida International University', 'university', 'US', 'FL'),
  ('Nova Southeastern University',     'university', 'US', 'FL'),
  ('University of Miami',  'university', 'US', 'FL')
ON CONFLICT (name, type) DO NOTHING;