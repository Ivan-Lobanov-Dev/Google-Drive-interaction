# Testing

## Test Database Setup

The project uses a separate database for tests to ensure isolation from development data.

### Configuration

- **Development Database**: `gdi_db` on port `5433`
- **Test Database**: `gdi_test_db` on port `5434`

### Running Tests

1. **Setup Test DB** (run once):
   ```bash
   npm run test:db:setup
   ```

2. **Run Tests**:
   ```bash
   npm test              # Watch mode
   npm run test:run      # Single run
   npm run test:coverage # With code coverage
   ```

3. **Reset Test DB** (if needed):
   ```bash
   npm run test:db:reset
   ```

4. **Stop Test DB**:
   ```bash
   npm run test:db:stop
   ```

### Test Isolation

Each test runs in an isolated environment:

- Database is cleaned before each test
- Separate environment variables are used
- DB connection is closed after each test

### Test Structure

```
src/
├── test/                    # Integration and E2E tests
│   ├── setup.ts            # Test environment setup
│   └── *.test.ts           # Test files
├── services/__tests__/     # Service unit tests
├── routes/__tests__/       # Route tests
└── middleware/__tests__/   # Middleware tests
```

### Test Environment Variables

Tests use the following environment variables:

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/gdi_test_db
DB_HOST=localhost
DB_PORT=5434
DB_NAME=gdi_test_db
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=test-jwt-secret
GOOGLE_CLIENT_ID=test-google-client-id
GOOGLE_CLIENT_SECRET=test-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### Best Practices

1. **Don't use production data** in tests
2. **Clean state** between tests
3. **Use mocks** for external services
4. **Write deterministic tests** - results should not depend on execution order
5. **Group related tests** in describe blocks

### Debugging Tests

For debugging tests you can:

1. Use `console.log` (they are mocked, but can be temporarily disabled)
2. Run specific tests: `npm test -- --run specific-test-file.test.ts`
3. Use `--reporter=verbose` for detailed output