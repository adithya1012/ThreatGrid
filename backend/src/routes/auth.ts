import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db/client";

interface AuthBody {
  username: string;
  password: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const SALT_ROUNDS = 10;

// ── Shared schema fragments ────────────────────────────────────────────────
const ErrorSchema = {
  type: "object",
  properties: { error: { type: "string" } },
} as const;

const UserResponseSchema = {
  type: "object",
  properties: {
    id:       { type: "string", format: "uuid" },
    username: { type: "string" },
  },
} as const;

const AuthBodySchema = {
  type: "object",
  required: ["username", "password"],
  properties: {
    username: { type: "string", minLength: 3, maxLength: 30, description: "3–30 chars: letters, numbers, underscore" },
    password: { type: "string", minLength: 6, description: "Minimum 6 characters" },
  },
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/auth/signup ─────────────────────────────────────────────────
  app.post(
    "/api/auth/signup",
    {
      schema: {
        tags: ["auth"],
        summary: "Register a new user",
        security: [],
        body: AuthBodySchema,
        response: {
          201: { description: "Created", ...UserResponseSchema },
          400: { description: "Validation error", ...ErrorSchema },
          409: { description: "Username already taken", ...ErrorSchema },
        },
      },
    },
    async (request: FastifyRequest<{ Body: AuthBody }>, reply: FastifyReply) => {
      const { username, password } = request.body ?? {};

      // Basic validation
      if (!username || !password) {
        return reply.status(400).send({ error: "Username and password are required" });
      }
      if (!USERNAME_RE.test(username)) {
        return reply
          .status(400)
          .send({ error: "Username must be 3–30 characters: letters, numbers, underscore" });
      }
      if (password.length < 6) {
        return reply.status(400).send({ error: "Password must be at least 6 characters" });
      }

      // Check duplicate
      const existing = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username]
      );
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: "Username already taken" });
      }

      // Hash + insert
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const result = await pool.query<{ id: string; username: string }>(
        `INSERT INTO users (username, password_hash)
         VALUES ($1, $2)
         RETURNING id, username`,
        [username, passwordHash]
      );

      const user = result.rows[0];
      return reply.status(201).send({ id: user.id, username: user.username });
    }
  );

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  app.post(
    "/api/auth/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Log in and receive a user ID",
        security: [],
        body: AuthBodySchema,
        response: {
          200: {
            description: "Successful login — pass `id` as `x-user-id` header",
            ...UserResponseSchema,
          },
          400: { description: "Missing credentials", ...ErrorSchema },
          401: { description: "Invalid username or password", ...ErrorSchema },
        },
      },
    },
    async (request: FastifyRequest<{ Body: AuthBody }>, reply: FastifyReply) => {
      const { username, password } = request.body ?? {};

      if (!username || !password) {
        return reply.status(400).send({ error: "Username and password are required" });
      }

      // Find user
      const result = await pool.query<{
        id: string;
        username: string;
        password_hash: string;
      }>(
        "SELECT id, username, password_hash FROM users WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        return reply.status(401).send({ error: "Invalid username or password" });
      }

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return reply.status(401).send({ error: "Invalid username or password" });
      }

      return reply.send({ id: user.id, username: user.username });
    }
  );
}
