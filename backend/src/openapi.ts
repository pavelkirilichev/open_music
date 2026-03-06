export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Open Music API',
    version: '1.0.0',
    description: 'Free music streaming aggregator API',
  },
  servers: [{ url: '/api', description: 'Current server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Track: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          provider: { type: 'string', enum: ['youtube', 'archive', 'jamendo'] },
          providerId: { type: 'string' },
          title: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string', nullable: true },
          duration: { type: 'integer', nullable: true, description: 'seconds' },
          artworkUrl: { type: 'string', nullable: true },
          year: { type: 'integer', nullable: true },
          genre: { type: 'string', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'username', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  username: { type: 'string', minLength: 3, maxLength: 32 },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created with tokens' },
          409: { description: 'Email/username taken' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/search': {
      get: {
        tags: ['Search'],
        summary: 'Search tracks/albums',
        security: [],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          {
            name: 'provider',
            in: 'query',
            schema: { type: 'string', enum: ['all', 'youtube', 'archive', 'jamendo'] },
          },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['track', 'album', 'artist'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
        ],
        responses: {
          200: {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tracks: { type: 'array', items: { $ref: '#/components/schemas/Track' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/stream/{provider}/{id}': {
      get: {
        tags: ['Stream'],
        summary: 'Stream audio (proxy)',
        parameters: [
          { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Audio stream' },
          206: { description: 'Partial content (range request)' },
          502: { description: 'Stream unavailable' },
        },
      },
    },
  },
};
