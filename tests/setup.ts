process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://sq:sq@localhost:5432/safraquest_test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.APP_URL = 'http://localhost:3000';
process.env.WHATSAPP_PROVIDER = 'console';
