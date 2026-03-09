import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { upsertTrack, getTrackMeta } from '../services/search.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../utils/errors';

export const playlistsRouter = Router();
playlistsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(false),
});

const addTrackSchema = z.object({
  provider: z.string(),
  providerId: z.string(),
});

// GET /api/playlists
playlistsRouter.get('/', async (req, res, next) => {
  try {
    const withTracks = req.query.withTracks === 'true';
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.user!.sub },
      include: withTracks
        ? { tracks: { include: { track: true }, orderBy: { position: 'asc' } } }
        : { _count: { select: { tracks: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(playlists);
  } catch (err) {
    next(err);
  }
});

// POST /api/playlists
playlistsRouter.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { name, description, isPublic } = req.body as z.infer<typeof createSchema>;
    const playlist = await prisma.playlist.create({
      data: { userId: req.user!.sub, name, description, isPublic },
    });
    res.status(201).json(playlist);
  } catch (err) {
    next(err);
  }
});

// GET /api/playlists/:id
playlistsRouter.get('/:id', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: req.params.id,
        OR: [{ userId: req.user!.sub }, { isPublic: true }],
      },
      include: {
        tracks: {
          include: { track: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!playlist) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');
    res.json(playlist);
  } catch (err) {
    next(err);
  }
});

// PUT /api/playlists/:id
playlistsRouter.put('/:id', validate(createSchema), async (req, res, next) => {
  try {
    const { name, description, isPublic } = req.body as z.infer<typeof createSchema>;
    const existing = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!existing) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');

    const updated = await prisma.playlist.update({
      where: { id: req.params.id },
      data: { name, description, isPublic },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/playlists/:id
playlistsRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!existing) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');
    await prisma.playlist.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/playlists/:id/tracks
playlistsRouter.post('/:id/tracks', validate(addTrackSchema), async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.user!.sub },
      include: { _count: { select: { tracks: true } } },
    });
    if (!playlist) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');

    const { provider, providerId } = req.body as z.infer<typeof addTrackSchema>;
    const meta = await getTrackMeta(provider, providerId);
    const trackId = await upsertTrack(meta);

    const position = playlist._count.tracks;
    await prisma.playlistTrack.upsert({
      where: { playlistId_trackId: { playlistId: playlist.id, trackId } },
      create: { playlistId: playlist.id, trackId, position },
      update: {},
    });

    await prisma.playlist.update({
      where: { id: playlist.id },
      data: { updatedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/playlists/:id/tracks/:trackId
playlistsRouter.delete('/:id/tracks/:trackId', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!playlist) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');

    await prisma.playlistTrack.deleteMany({
      where: { playlistId: playlist.id, trackId: req.params.trackId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/playlists/:id/export — Export as JSON
playlistsRouter.get('/:id/export', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: req.params.id,
        OR: [{ userId: req.user!.sub }, { isPublic: true }],
      },
      include: {
        tracks: {
          include: { track: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!playlist) throw new AppError(404, 'Playlist not found', 'NOT_FOUND');

    const exportData = {
      version: 1,
      name: playlist.name,
      description: playlist.description,
      exportedAt: new Date().toISOString(),
      tracks: playlist.tracks.map((pt) => ({
        provider: pt.track.provider,
        providerId: pt.track.providerId,
        title: pt.track.title,
        artist: pt.track.artist,
        album: pt.track.album,
        duration: pt.track.duration,
      })),
    };

    res
      .header('Content-Disposition', `attachment; filename="${playlist.name}.json"`)
      .header('Content-Type', 'application/json')
      .json(exportData);
  } catch (err) {
    next(err);
  }
});

// POST /api/playlists/import — Import from JSON
playlistsRouter.post('/import', async (req, res, next) => {
  try {
    const { name, description, tracks } = req.body as {
      name: string;
      description?: string;
      tracks: Array<{ provider: string; providerId: string; title: string; artist: string }>;
    };

    if (!name || !Array.isArray(tracks)) {
      throw new AppError(400, 'Invalid playlist JSON format', 'VALIDATION_ERROR');
    }

    const playlist = await prisma.playlist.create({
      data: {
        userId: req.user!.sub,
        name: name + ' (imported)',
        description,
      },
    });

    let position = 0;
    for (const t of tracks.slice(0, 500)) {
      try {
        const meta = await getTrackMeta(t.provider, t.providerId);
        const trackId = await upsertTrack(meta);
        await prisma.playlistTrack.create({
          data: { playlistId: playlist.id, trackId, position: position++ },
        });
      } catch {
        // Skip tracks that can't be resolved
      }
    }

    res.status(201).json({ playlistId: playlist.id, tracksImported: position });
  } catch (err) {
    next(err);
  }
});
