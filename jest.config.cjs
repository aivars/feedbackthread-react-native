module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/*.test.tsx'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
};
