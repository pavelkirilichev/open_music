import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create demo user
  const hash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@openmusic.app' },
    update: {},
    create: {
      email: 'demo@openmusic.app',
      username: 'demo',
      passwordHash: hash,
    },
  });

  console.log('Created demo user:', user.email);

  // Create sample playlist
  await prisma.playlist.upsert({
    where: { id: 'demo-playlist-1' },
    update: {},
    create: {
      id: 'demo-playlist-1',
      userId: user.id,
      name: 'My First Playlist',
      description: 'Demo playlist',
      isPublic: true,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
