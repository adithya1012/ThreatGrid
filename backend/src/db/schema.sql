-- Zscaler SOC Dashboard Schema
-- Run: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table: one row per registered account
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Upload sessions table: tracks each CSV upload; scoped to a user
CREATE TABLE IF NOT EXISTS upload_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename       VARCHAR(255),
  uploaded_at    TIMESTAMP DEFAULT NOW(),
  total_rows     INTEGER,
  anomaly_count  INTEGER,
  status         VARCHAR(50)
);

-- Zscaler log entries table
CREATE TABLE IF NOT EXISTS zscaler_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID REFERENCES upload_sessions(id) ON DELETE CASCADE,
  datetime             TIMESTAMP,
  user_email           VARCHAR(255),
  client_ip            VARCHAR(50),
  url                  TEXT,
  action               VARCHAR(50),
  url_category         VARCHAR(255),
  threat_name          VARCHAR(255),
  threat_severity      VARCHAR(50),
  department           VARCHAR(255),
  transaction_size     INTEGER,
  request_method       VARCHAR(20),
  status_code          VARCHAR(10),
  url_class            VARCHAR(255),
  dlp_engine           VARCHAR(255),
  useragent            TEXT,
  location             VARCHAR(255),
  app_name             VARCHAR(255),
  app_class            VARCHAR(255),
  is_anomaly           BOOLEAN DEFAULT FALSE,
  anomaly_confidence   INTEGER DEFAULT 0,
  anomaly_reason       TEXT,
  raw_json             JSONB
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id    ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_zscaler_logs_session_id    ON zscaler_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_zscaler_logs_is_anomaly    ON zscaler_logs(is_anomaly);
CREATE INDEX IF NOT EXISTS idx_zscaler_logs_datetime      ON zscaler_logs(datetime);
CREATE INDEX IF NOT EXISTS idx_zscaler_logs_threat_name   ON zscaler_logs(threat_name);
CREATE INDEX IF NOT EXISTS idx_zscaler_logs_url_category  ON zscaler_logs(url_category);

-- Chat messages table: stores the conversation history for each session analysis
CREATE TABLE IF NOT EXISTS chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content        TEXT NOT NULL,
  tools_used     JSONB DEFAULT '[]'::jsonb,
  page_context   JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Fast history lookup: session + time ordering
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages(session_id, created_at ASC);
