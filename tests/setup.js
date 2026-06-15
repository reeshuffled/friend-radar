// Use in-memory SQLite for all tests — set before any module import touches getDb().
process.env.DB_PATH = ":memory:";
