-- 001_initial_schema.sql

-- Coaches Table
CREATE TABLE coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    discord_id TEXT NOT NULL UNIQUE
);

-- Sessions Table
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datetime TEXT NOT NULL, -- ISO 8601 format
    duration_minutes INTEGER NOT NULL,
    title TEXT,
    availableCoaches TEXT NOT NULL, -- JSON array of coach IDs
    isClaimed BOOLEAN NOT NULL DEFAULT 0,
    claimedBy TEXT, -- User's Discord ID
    claimedCoach INTEGER, -- Foreign key to coaches.id
    guildScheduledEventId TEXT,
    FOREIGN KEY (claimedCoach) REFERENCES coaches(id) ON DELETE SET NULL
);

-- Settings Table for bot configuration
CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- Insert default settings (can be updated by commands)
INSERT INTO settings (key, value) VALUES ('sessionsChannelId', '');
INSERT INTO settings (key, value) VALUES ('cancellationsChannelId', '');
