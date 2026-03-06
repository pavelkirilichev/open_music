import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { JwtPayload } from '../types';

const ACCESS_SECRET = () => {
  if (!process.env.JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET not set');
  return process.env.JWT_ACCESS_SECRET;
};
const REFRESH_SECRET = () => {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET not set');
  return process.env.JWT_REFRESH_SECRET;
};

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export async function register(email: string, username: string, password: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    throw new AppError(409, 'Email or username already taken', 'CONFLICT');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
    select: { id: true, email: true, username: true, createdAt: true },
  });

  const { accessToken, refreshToken } = await issueTokens(user.id, user.email);
  return { user, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const { accessToken, refreshToken } = await issueTokens(user.id, user.email);
  return {
    user: { id: user.id, email: user.email, username: user.username },
    accessToken,
    refreshToken,
  };
}

export async function refreshTokens(token: string) {
  // Verify JWT signature and expiry
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, REFRESH_SECRET()) as JwtPayload;
  } catch {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Refresh token revoked or expired', 'INVALID_REFRESH_TOKEN');
  }

  // Rotate — revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(payload.sub, payload.email);
}

export async function logout(token: string) {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, avatarUrl: true, createdAt: true },
  });
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return user;
}

// ─── Internal ──────────────────────────────────────────────────────────────────

async function issueTokens(userId: string, email: string) {
  const accessPayload: JwtPayload = { sub: userId, email };
  const accessToken = jwt.sign(accessPayload, ACCESS_SECRET(), {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'],
  });

  const refreshRaw = generateRefreshToken();
  const refreshToken = jwt.sign({ sub: userId, email }, REFRESH_SECRET(), {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });

  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  // Keep only last 5 refresh tokens per user (cleanup)
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    skip: 5,
    select: { id: true },
  });
  if (tokens.length > 0) {
    await prisma.refreshToken.updateMany({
      where: { id: { in: tokens.map((t) => t.id) } },
      data: { revokedAt: new Date() },
    });
  }

  void refreshRaw; // used only for hashing pattern, JWT contains the actual token
  return { accessToken, refreshToken };
}
